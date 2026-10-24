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
  CalendarCheck,
  Maximize2,
  Minimize2,
  ClipboardList,
  X,
  Printer,
  Table,
  FileText,
  Pill,
  FolderDown,
  FileDown,
  RotateCcw,
  ArrowRightLeft,
  ArrowRight,
  LayoutGrid,
  Ban,
  MessageSquare,
  CreditCard,
  Tag,
  Plus,
  Trash2,
  Check,
  Copy,
  Menu,
  PackageCheck
} from 'lucide-react';
import { User } from '../../types';
import { useToast } from '../ToastContext';
import PedidosTab from './BelaPedPedidosTab';
import BelaPedResumoTremor from './BelaPedResumoTremor';
import BelaPedSimuladorGiro from './BelaPedSimuladorGiro';
import { BelaPedRobotMonitor } from './BelaPedRobotMonitor';
import { BelaPedPrecoHistoricoModal } from './BelaPedPrecoHistoricoModal';
import { BelaPedOrcamentoSemanalModal } from './BelaPedOrcamentoSemanalModal';
import { BelaPedConcorrentesModal } from './BelaPedConcorrentesModal';
import BelaPedDecisaoTab from './BelaPedDecisaoTab';
import BelaPedCotacoesMatrizTab from './BelaPedCotacoesMatrizTab';
import { BelaPedPesquisaPrecosTab } from './BelaPedPesquisaPrecosTab';
import { VersionModal } from '../VersionModal';

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
  imagem_url?: string | null;
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
  url_produto_1?: string | null;
  fornecedor_2?: string;
  preco_2?: number;
  url_produto_2?: string | null;
  diferenca_percentual?: number;
  melhor_dia_semana?: string;
  melhor_dia_semana_index?: number;
  status_dia?: 'MELHOR_DIA' | 'EMERGENCIAL_RUPTURA' | 'RETIDO_OUTRO_DIA';
  qtd_emergencial?: number;
  prioridade?: 'P1' | 'P2' | 'P3' | 'P4';
  prioridade_rotulo?: string;
  condicao_comercial_1?: string | null;
  preco_padrao_1?: number | null;
  is_generico_mais_barato_1?: boolean;
  ean_substituto_1?: string | null;
  laboratorio_1?: string | null;
  is_substituto_1?: boolean;
  todos_concorrentes_1?: any[];
  condicao_comercial_2?: string | null;
  preco_padrao_2?: number | null;
  nao_cotar?: boolean;
  nao_carrinho?: boolean;
  motivo_justificativa?: string;
  adiar_ate?: string | null;
  is_adiado_proxima_semana?: boolean;
  ja_pedido_ate?: string | null;
  is_ja_pedido?: boolean;
  ja_pedido_detalhe?: {
    automatico: boolean;
    distribuidora?: string;
    data?: string;
    numero_pedido?: string | null;
    motivo?: string;
  } | null;
  melhor_fora_janela?: {
    distribuidora: string;
    preco: number;
    motivo: string;
  } | null;
  ranking_posicao?: number;
  score_ranking?: number;
  todas_cotacoes_reais?: Array<{ distribuidora: string; preco: number }>;
  repassado_de?: string;
  is_desejado?: boolean;
  id_desejado?: string | null;
  motivo_desejado?: string | null;
  falta_balcao_belinha?: {
    id: string;
    productName: string;
    clientInquiry: boolean;
    notes?: string;
    userName: string;
    createdAt: string;
    source?: string;
  } | null;
}

interface PortalDistribuidora {
  id: string;
  nome: string;
  url_portal: string;
  usuario: string;
  pedido_minimo: number;
  prazo_dias_padrao: number;
  prazos_boleto?: string;
  data_ultima_auditoria?: string;
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
  
  // Abas de Navegação do BelaPed (Decisão de Compras como aba inicial prioritária)
  const [activeTab, setActiveTab] = useState<'pesquisa_precos' | 'decisao' | 'cotacoes_matriz' | 'faltas' | 'cotacao' | 'orcamento' | 'relatorios' | 'pedidos' | 'simulador'>('decisao');
  const [produtoSimuladorId, setProdutoSimuladorId] = useState<number | null>(null);
  const [versionModalOpen, setVersionModalOpen] = useState(false);

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
    janelasDisponiveis?: Array<{
      chave: string;
      label: string;
      isMesAtual: boolean;
      mes: number;
      ano: number;
      nomeMes: string;
      limite: number;
      limiteSemanalPadrao: number;
      qtdSemanas: number;
      totalComprometido: number;
      saldoLivre: number;
      statusOrcamento: 'LIBERADO' | 'ALERTA' | 'ESTOURADO';
      cotaSemanalLivre: number;
      cotaSemanalSegura: number;
      reservaSeguranca: number;
      distribuidorasElegiveis: string[];
    }>;
    ano?: number;
  } | null>(null);

  // Janela Alvo de Orçamento Ativa (Ex: '2027-01' ou primeiro mês liberado)
  const [janelaAlvoSelecionada, setJanelaAlvoSelecionada] = useState<string>(() => {
    try {
      return localStorage.getItem('belaped_janela_alvo') || '';
    } catch {
      return '';
    }
  });

  // Modal de Consulta do Limite Semanal de Gastos
  const [orcamentoSemanalModalOpen, setOrcamentoSemanalModalOpen] = useState(false);

  // Controle de Transição Dinâmica: Lista de Urgência -> Lista de Compras Regulares
  const [modoListaManual, setModoListaManual] = useState<'AUTO' | 'URGENCIA' | 'COMPRAS_REGULARES'>('AUTO');

  // Integração com a Guia de Faltas do Belinha (Livro de Faltas do Balcão)
  const [faltasBalcaoBelinha, setFaltasBalcaoBelinha] = useState<any[]>([]);
  const [gavetaBalcaoAberta, setGavetaBalcaoAberta] = useState<boolean>(false);
  const [filtroApenasBalcao, setFiltroApenasBalcao] = useState<boolean>(false);

  // Modo Exibir Apenas a Tabela (Oculta menu lateral e cards executivos para foco 100% na tabela)
  const [modoApenasTabela, setModoApenasTabela] = useState<boolean>(() => {
    try {
      return localStorage.getItem('belaped_apenas_tabela') === 'true' || localStorage.getItem('belaped_tabela_expandida') === 'true';
    } catch {
      return false;
    }
  });

  // Aliases para retrocompatibilidade
  const modoTabelaExpandida = modoApenasTabela;
  const setModoTabelaExpandida = setModoApenasTabela;

  const alternarModoApenasTabela = () => {
    const novo = !modoApenasTabela;
    setModoApenasTabela(novo);
    try {
      localStorage.setItem('belaped_apenas_tabela', String(novo));
      localStorage.setItem('belaped_tabela_expandida', String(novo));
    } catch {}
  };

  // Gaveta de Navegação e Filtros em Telas Móveis (ex: Galaxy S21)
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Modo de visualização dos produtos a cotar/comprar: CARDS por padrão (conforme solicitado pelo usuário)
  const [modoVisualizacao, setModoVisualizacao] = useState<'cards' | 'tabela'>(() => {
    try {
      const salvo = localStorage.getItem('belaped_modo_visualizacao');
      return (salvo === 'tabela' || salvo === 'cards') ? salvo : 'cards';
    } catch {
      return 'cards';
    }
  });

  const alternarModoVisualizacao = (modo: 'cards' | 'tabela') => {
    setModoVisualizacao(modo);
    try {
      localStorage.setItem('belaped_modo_visualizacao', modo);
    } catch {}
  };

  // Filtro específico para regras de produtos
  const [filtroRegras, setFiltroRegras] = useState<'TODOS' | 'BLOQUEADOS_CARRINHO' | 'NAO_COTAR' | 'ADIADOS_PROXIMA_SEMANA' | 'LIBERADOS'>('TODOS');
  const [justificativaEditando, setJustificativaEditando] = useState<{ [id: number]: string }>({});
  const [copiadoEan, setCopiadoEan] = useState<string | null>(null);

  // Estados para Auditoria Segura de Prazos de Boletos e Pedidos Mínimos
  const [auditandoPrazos, setAuditandoPrazos] = useState(false);
  const [modalAuditoriaAberta, setModalAuditoriaAberta] = useState(false);
  const [dadosAuditoria, setDadosAuditoria] = useState<{ historico: any[]; resumoPortais: any[] } | null>(null);

  // Estados para Gestão de Campanhas Especiais da Distrimed
  const [modalCampanhasAberta, setModalCampanhasAberta] = useState(false);
  const [campanhasDistrimed, setCampanhasDistrimed] = useState<any[]>([]);
  const [salvandoCampanha, setSalvandoCampanha] = useState(false);
  const [formCampanha, setFormCampanha] = useState({ id: null, nome_opcao: '', termos_busca: '', minimo_valor: 0, minimo_qtd: 0, ativo: 1 });

  // Copiar EAN para área de transferência
  const handleCopiarEan = (ean: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!ean) return;
    try {
      navigator.clipboard.writeText(ean);
      setCopiadoEan(ean);
      addToast(`EAN ${ean} copiado!`, 'success');
      setTimeout(() => setCopiadoEan(null), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  // Atualizar Regra de Produto (Não colocar no carrinho, Não cotar, Justificativa, Adiar e Já Pedido)
  const handleAtualizarRegraProduto = async (
    item: FaltaItem7d,
    campo: 'nao_cotar' | 'nao_carrinho' | 'motivo_justificativa' | 'adiar_ate' | 'ja_pedido_ate',
    valor: any
  ) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const novoAdiarAte = campo === 'adiar_ate' ? (valor || null) : (item.adiar_ate || null);
    const isAdiado = Boolean(novoAdiarAte && String(novoAdiarAte) >= hoje);
    const novoJaPedidoAte = campo === 'ja_pedido_ate' ? (valor || null) : (item.ja_pedido_ate || null);
    const isJaPedido = Boolean(novoJaPedidoAte && String(novoJaPedidoAte) >= hoje);

    const novaRegra = {
      nao_cotar: campo === 'nao_cotar' ? Boolean(valor) : Boolean(item.nao_cotar),
      nao_carrinho: campo === 'nao_carrinho' ? Boolean(valor) : Boolean(item.nao_carrinho),
      motivo_justificativa: campo === 'motivo_justificativa' ? String(valor) : String(item.motivo_justificativa || ''),
      adiar_ate: novoAdiarAte,
      is_adiado_proxima_semana: isAdiado,
      ja_pedido_ate: novoJaPedidoAte,
      is_ja_pedido: isJaPedido
    };

    // Atualização otimista no estado local imediato
    setFaltasRaw(prev => prev.map(f => {
      const matchId = String(f.produto_id) === String(item.produto_id);
      const matchEan = Boolean(f.ean && item.ean && String(f.ean).trim() === String(item.ean).trim());
      if (matchId || matchEan) {
        return { ...f, ...novaRegra };
      }
      return f;
    }));

    // Se marcou para não colocar no carrinho, adiou para próxima semana ou marcou como já pedido, desmarca da seleção de compra
    if ((campo === 'nao_carrinho' && valor === true) || (campo === 'adiar_ate' && valor) || (campo === 'ja_pedido_ate' && valor)) {
      setItensSelecionados(prev => ({ ...prev, [item.produto_id]: false }));
    }

    try {
      const res = await fetch('/api/belaped/produtos-regras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ean: item.ean,
          produto_id: item.produto_id,
          descricao: item.descricao,
          ...novaRegra,
          usuario: user?.name || user?.username || 'Farmacêutico'
        })
      });
      const data = await res.json();
      if (data.success) {
        if (campo === 'nao_carrinho') {
          addToast(valor ? `"${item.descricao}" bloqueado para carrinho!` : `"${item.descricao}" liberado para carrinho!`, 'info');
        } else if (campo === 'nao_cotar') {
          addToast(valor ? `"${item.descricao}" marcado para NÃO cotar!` : `"${item.descricao}" liberado para cotação!`, 'info');
        } else if (campo === 'motivo_justificativa') {
          addToast(`Justificativa salva com sucesso!`, 'success');
        } else if (campo === 'adiar_ate') {
          addToast(valor ? `"${item.descricao}" adiado para cotar na próxima semana!` : `"${item.descricao}" liberado para cotar nesta semana!`, 'success');
        } else if (campo === 'ja_pedido_ate') {
          addToast(valor ? `"${item.descricao}" marcado como Já Pedido!` : `"${item.descricao}" desmarcado de Já Pedido!`, 'info');
        }
      }
    } catch (e: any) {
      console.error('Erro ao sincronizar regra:', e);
      addToast('Erro ao salvar regra: ' + e.message, 'error');
    }
  };

  // Alternar Deixar para Cotar na Próxima Semana
  const handleAlternarAdiarProximaSemana = (item: FaltaItem7d, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const jaAdiado = Boolean(item.adiar_ate && String(item.adiar_ate) >= hoje);
    if (jaAdiado) {
      handleAtualizarRegraProduto(item, 'adiar_ate', null);
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      const proximaData = d.toISOString().slice(0, 10);
      handleAtualizarRegraProduto(item, 'adiar_ate', proximaData);
    }
  };

  // Alternar Status de Já Pedido
  const handleAlternarJaPedido = (item: FaltaItem7d, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const jaPedido = Boolean(item.is_ja_pedido || (item.ja_pedido_ate && String(item.ja_pedido_ate) >= hoje));
    if (jaPedido) {
      handleAtualizarRegraProduto(item, 'ja_pedido_ate', null);
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      const proximaData = d.toISOString().slice(0, 10);
      handleAtualizarRegraProduto(item, 'ja_pedido_ate', proximaData);
    }
  };

  // Disparar Auditoria Segura de Prazos de Boletos e Pedidos Mínimos
  const handleDispararAuditoriaPrazos = async (portal?: string) => {
    try {
      setAuditandoPrazos(true);
      addToast(
        portal
          ? `Iniciando simulação segura no portal ${portal}...`
          : 'Iniciando auditoria segura de prazos de boletos e pedidos mínimos em todas as distribuidoras...',
        'info'
      );
      const res = await fetch('/api/belaped/auditar-prazos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal })
      });
      const data = await res.json();
      if (data.success) {
        addToast(data.message || 'Auditoria disparada com sucesso! Os resultados serão salvos no banco.', 'success');
        setTimeout(() => {
          carregarAuditoriaPrazos();
          carregarDados();
        }, 3000);
      } else {
        addToast(data.error || 'Erro ao iniciar auditoria de prazos.', 'error');
      }
    } catch (err: any) {
      addToast('Erro na auditoria de prazos: ' + err.message, 'error');
    } finally {
      setAuditandoPrazos(false);
    }
  };

  // Carregar Histórico e Resumo da Auditoria de Prazos
  const carregarAuditoriaPrazos = async () => {
    try {
      const res = await fetch('/api/belaped/auditoria-prazos');
      const data = await res.json();
      if (data.success) {
        setDadosAuditoria(data);
      }
    } catch (e) {}
  };

  // Carregar Campanhas Comerciais da Distrimed
  const carregarCampanhasDistrimed = async () => {
    try {
      const res = await fetch('/api/belaped/distrimed-campanhas');
      const data = await res.json();
      if (data.success) {
        setCampanhasDistrimed(data.campanhas || []);
      }
    } catch (e) {}
  };

  // Salvar Campanha Comercial da Distrimed
  const handleSalvarCampanhaDistrimed = async () => {
    if (!formCampanha.nome_opcao || !formCampanha.termos_busca) {
      addToast('Nome da opção e palavras-chave são obrigatórios.', 'warning');
      return;
    }
    try {
      setSalvandoCampanha(true);
      const res = await fetch('/api/belaped/distrimed-campanhas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formCampanha)
      });
      const data = await res.json();
      if (data.success) {
        addToast('Campanha da Distrimed salva com sucesso!', 'success');
        setFormCampanha({ id: null, nome_opcao: '', termos_busca: '', minimo_valor: 0, minimo_qtd: 0, ativo: 1 });
        carregarCampanhasDistrimed();
      } else {
        addToast(data.error || 'Erro ao salvar campanha.', 'error');
      }
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setSalvandoCampanha(false);
    }
  };

  // Remover Campanha Comercial da Distrimed
  const handleRemoverCampanhaDistrimed = async (id: number) => {
    try {
      const res = await fetch(`/api/belaped/distrimed-campanhas/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        addToast('Campanha removida.', 'info');
        carregarCampanhasDistrimed();
      }
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  // Modal de Exportação TXT com opções de Agrupamento por Categoria e Fornecedor
  const [modalExportarTxtOpen, setModalExportarTxtOpen] = useState(false);

  // Gerar e Baixar Relatório em Arquivo TXT Organizado por Fornecedores e Categorias
  const handleGerarRelatorioTxt = (
    modo: 'FORNECEDOR_E_CATEGORIA' | 'SO_MEDICAMENTOS' | 'SO_PERFUMARIA' | 'ARQUIVOS_SEPARADOS' = 'FORNECEDOR_E_CATEGORIA'
  ) => {
    // 1. Filtra itens marcados/selecionados
    let itensSel = faltas.filter(f => itensSelecionados[f.produto_id]);
    if (itensSel.length === 0) {
      addToast('Nenhum produto selecionado para gerar o arquivo TXT.', 'warning');
      return;
    }

    if (modo === 'SO_MEDICAMENTOS') {
      itensSel = itensSel.filter(f => f.tipo_categoria === 'MEDICAMENTO');
      if (itensSel.length === 0) {
        addToast('Nenhum medicamento selecionado para exportação.', 'warning');
        return;
      }
    } else if (modo === 'SO_PERFUMARIA') {
      itensSel = itensSel.filter(f => f.tipo_categoria !== 'MEDICAMENTO');
      if (itensSel.length === 0) {
        addToast('Nenhum item de perfumaria selecionado para exportação.', 'warning');
        return;
      }
    }

    // 2. Agrupa os itens por fornecedor vencedor (ou "NÃO COTADO")
    const grupos: Record<string, {
      distribuidora: string;
      itens: typeof itensSel;
      totalValor: number;
      totalUnidades: number;
    }> = {};

    itensSel.forEach(item => {
      const fornecedor = (item.fornecedor_1 && item.fornecedor_1 !== '—' && !item.fornecedor_1.includes('Sem Estoque'))
        ? item.fornecedor_1.trim().toUpperCase()
        : 'OUTROS / NÃO COTADO';

      if (!grupos[fornecedor]) {
        grupos[fornecedor] = {
          distribuidora: fornecedor,
          itens: [],
          totalValor: 0,
          totalUnidades: 0
        };
      }
      grupos[fornecedor].itens.push(item);
      grupos[fornecedor].totalValor += (Number(item.subtotal_7d) || 0);
      grupos[fornecedor].totalUnidades += (Number(item.qtd_sugerida_7d) || 0);
    });

    const dataHora = new Date().toLocaleString('pt-BR');
    const dataIso = new Date().toISOString().split('T')[0];
    const divisorForte = '='.repeat(84);
    const divisorSuave = '-'.repeat(84);

    // Função auxiliar para montar o texto de uma distribuidora específica dividida por categoria
    const formatarSecaoDistribuidora = (grp: typeof grupos[string]) => {
      const secLinhas: string[] = [];
      secLinhas.push(`=== FORNECEDOR: ${grp.distribuidora} ===`);
      secLinhas.push(`Total Fornecedor: ${grp.itens.length} itens | Volume: ${grp.totalUnidades} un | Total Pedido: R$ ${grp.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      secLinhas.push(divisorSuave);

      const itensMed = grp.itens.filter(it => it.tipo_categoria === 'MEDICAMENTO');
      const itensPerf = grp.itens.filter(it => it.tipo_categoria !== 'MEDICAMENTO');

      // Seção 1: Medicamentos
      if (itensMed.length > 0 && modo !== 'SO_PERFUMARIA') {
        const valMed = itensMed.reduce((acc, it) => acc + (Number(it.subtotal_7d) || 0), 0);
        const unMed = itensMed.reduce((acc, it) => acc + (Number(it.qtd_sugerida_7d) || 0), 0);
        secLinhas.push(`--- [ CATEGORIA: 💊 MEDICAMENTOS (${itensMed.length} itens • ${unMed} un • Subtotal: R$ ${valMed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) ] ---`);
        secLinhas.push(
          'QTD'.padEnd(7) +
          ' | ' + 'EAN'.padEnd(14) +
          ' | ' + 'PRODUTO / APRESENTAÇÃO'.padEnd(42) +
          ' | ' + 'PREÇO UN.'.padStart(10) +
          ' | ' + 'SUBTOTAL'.padStart(12)
        );
        secLinhas.push(divisorSuave);

        itensMed.sort((a, b) => a.descricao.localeCompare(b.descricao)).forEach((it) => {
          const qtdStr = `${it.qtd_sugerida_7d} un`.padEnd(7);
          const eanStr = (it.ean || 'SEM EAN').padEnd(14);
          const descTrunc = it.descricao.length > 41 ? it.descricao.substring(0, 38) + '...' : it.descricao.padEnd(42);
          const precoUn = (Number(it.preco_1 || it.custo_unitario || 0)).toFixed(2);
          const precoStr = `R$ ${precoUn}`.padStart(10);
          const subStr = `R$ ${(Number(it.subtotal_7d) || 0).toFixed(2)}`.padStart(12);
          secLinhas.push(`${qtdStr} | ${eanStr} | ${descTrunc} | ${precoStr} | ${subStr}`);
        });

        secLinhas.push(divisorSuave);
        secLinhas.push(`Subtotal Medicamentos (${grp.distribuidora}): R$ ${valMed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${unMed} unidades)`);
        secLinhas.push('');
      }

      // Seção 2: Perfumaria & Higiene
      if (itensPerf.length > 0 && modo !== 'SO_MEDICAMENTOS') {
        const valPerf = itensPerf.reduce((acc, it) => acc + (Number(it.subtotal_7d) || 0), 0);
        const unPerf = itensPerf.reduce((acc, it) => acc + (Number(it.qtd_sugerida_7d) || 0), 0);
        secLinhas.push(`--- [ CATEGORIA: 🧴 PERFUMARIA & NÃO-MEDICAMENTOS (${itensPerf.length} itens • ${unPerf} un • Subtotal: R$ ${valPerf.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) ] ---`);
        secLinhas.push(
          'QTD'.padEnd(7) +
          ' | ' + 'EAN'.padEnd(14) +
          ' | ' + 'PRODUTO / APRESENTAÇÃO'.padEnd(42) +
          ' | ' + 'PREÇO UN.'.padStart(10) +
          ' | ' + 'SUBTOTAL'.padStart(12)
        );
        secLinhas.push(divisorSuave);

        itensPerf.sort((a, b) => a.descricao.localeCompare(b.descricao)).forEach((it) => {
          const qtdStr = `${it.qtd_sugerida_7d} un`.padEnd(7);
          const eanStr = (it.ean || 'SEM EAN').padEnd(14);
          const descTrunc = it.descricao.length > 41 ? it.descricao.substring(0, 38) + '...' : it.descricao.padEnd(42);
          const precoUn = (Number(it.preco_1 || it.custo_unitario || 0)).toFixed(2);
          const precoStr = `R$ ${precoUn}`.padStart(10);
          const subStr = `R$ ${(Number(it.subtotal_7d) || 0).toFixed(2)}`.padStart(12);
          secLinhas.push(`${qtdStr} | ${eanStr} | ${descTrunc} | ${precoStr} | ${subStr}`);
        });

        secLinhas.push(divisorSuave);
        secLinhas.push(`Subtotal Perfumaria (${grp.distribuidora}): R$ ${valPerf.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${unPerf} unidades)`);
        secLinhas.push('');
      }

      secLinhas.push(`TOTAL GERAL ${grp.distribuidora}: R$ ${grp.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${grp.totalUnidades} unidades)`);
      secLinhas.push('');
      secLinhas.push('');
      return secLinhas;
    };

    const dispararDownloadTxt = (nomeArquivo: string, conteudoTexto: string) => {
      const blob = new Blob([conteudoTexto], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nomeArquivo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    // MODO: ARQUIVOS SEPARADOS POR DISTRIBUIDORA
    if (modo === 'ARQUIVOS_SEPARADOS') {
      let geradosCount = 0;
      Object.keys(grupos).forEach(dist => {
        const grp = grupos[dist];
        if (grp.itens.length === 0) return;

        const linhasInd: string[] = [];
        linhasInd.push(divisorForte);
        linhasInd.push(`DROGARIA BELA FARMA - PEDIDO: ${grp.distribuidora}`);
        linhasInd.push(`Emissão: ${dataHora} | Responsável: ${user?.name || 'Administrador'}`);
        linhasInd.push(`Itens no Pedido: ${grp.itens.length} | Volume Total: ${grp.totalUnidades} un | Valor Total: R$ ${grp.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        linhasInd.push(divisorForte);
        linhasInd.push('');
        linhasInd.push(...formatarSecaoDistribuidora(grp));

        const nomeSanitizado = grp.distribuidora.replace(/[^a-zA-Z0-9_-]/g, '_');
        dispararDownloadTxt(`pedido_${nomeSanitizado}_belafarma_${dataIso}.txt`, linhasInd.join('\r\n'));
        geradosCount++;
      });

      addToast(`${geradosCount} arquivos TXT individuais gerados com sucesso!`, 'success');
      setModalExportarTxtOpen(false);
      return;
    }

    // MODO: ARQUIVO CONSOLIDADO COM SEPARAÇÃO POR CATEGORIAS & FORNECEDOR
    const linhas: string[] = [];
    const rotuloModo = modo === 'SO_MEDICAMENTOS' 
      ? 'SOMENTE MEDICAMENTOS' 
      : modo === 'SO_PERFUMARIA' 
      ? 'SOMENTE PERFUMARIA & NÃO-MEDICAMENTOS' 
      : 'SEPARADO POR FORNECEDOR & CATEGORIAS';

    linhas.push(divisorForte);
    linhas.push(`DROGARIA BELA FARMA - RELATÓRIO DE COMPRAS (${rotuloModo})`);
    linhas.push(`Emissão: ${dataHora} | Responsável: ${user?.name || 'Administrador'}`);
    linhas.push(`Total de Itens: ${itensSel.length} | Valor Total Estimado: R$ ${itensSel.reduce((a, b) => a + (Number(b.subtotal_7d) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    linhas.push(divisorForte);
    linhas.push('');

    // Ordena as distribuidoras: empresas com maior valor primeiro, e "NÃO COTADO" por último
    const chavesOrdenadas = Object.keys(grupos).sort((a, b) => {
      if (a.includes('NÃO COTADO')) return 1;
      if (b.includes('NÃO COTADO')) return -1;
      return grupos[b].totalValor - grupos[a].totalValor;
    });

    let totalGeralReais = 0;
    let totalGeralUnidades = 0;
    let totalMedGeral = 0;
    let totalPerfGeral = 0;

    chavesOrdenadas.forEach(dist => {
      const grp = grupos[dist];
      totalGeralReais += grp.totalValor;
      totalGeralUnidades += grp.totalUnidades;
      totalMedGeral += grp.itens.filter(i => i.tipo_categoria === 'MEDICAMENTO').reduce((a, b) => a + (Number(b.subtotal_7d) || 0), 0);
      totalPerfGeral += grp.itens.filter(i => i.tipo_categoria !== 'MEDICAMENTO').reduce((a, b) => a + (Number(b.subtotal_7d) || 0), 0);

      linhas.push(...formatarSecaoDistribuidora(grp));
    });

    linhas.push(divisorForte);
    linhas.push('RESUMO CONSOLIDADO GERAL DE COMPRAS:');
    linhas.push(`* Distribuidoras no Pedido: ${chavesOrdenadas.length}`);
    linhas.push(`* Total de Produtos Selecionados: ${itensSel.length}`);
    linhas.push(`* Total de Unidades Físicas: ${totalGeralUnidades} unidades`);
    linhas.push(`* Subtotal Geral Medicamentos: R$ ${totalMedGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    linhas.push(`* Subtotal Geral Perfumaria/Outros: R$ ${totalPerfGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    linhas.push(`* VALOR TOTAL ESTIMADO DA COMPRA: R$ ${totalGeralReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    linhas.push(divisorForte);

    const sufixoNome = modo === 'SO_MEDICAMENTOS' ? 'MEDICAMENTOS' : modo === 'SO_PERFUMARIA' ? 'PERFUMARIA' : 'CATEGORIAS_E_FORNECEDORES';
    dispararDownloadTxt(`compras_belafarma_${sufixoNome}_${dataIso}.txt`, linhas.join('\r\n'));

    addToast(`Arquivo TXT (${rotuloModo}) gerado com sucesso!`, 'success');
    setModalExportarTxtOpen(false);
  };

  const handleImprimirTabela = () => setModalExportarTxtOpen(true);

  // Faltas 7 Dias + Inteligência Anti-Ruptura e Equalizador de Volumes
  const [faltasRaw, setFaltasRaw] = useState<FaltaItem7d[]>([]);
  const [itensAvulsos, setItensAvulsos] = useState<any[]>([]);
  const [filtroCurva, setFiltroCurva] = useState<'TODAS' | 'A' | 'B' | 'C' | 'ESQUECIDOS_6M' | 'DESEJADOS'>('TODAS');
  const [filtroPrioridade, setFiltroPrioridade] = useState<'TODAS' | 'P1' | 'P2' | 'P3' | 'P4'>('TODAS');
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

  // Orçamento Semanal Personalizado (ajuste dinâmico da seleção de compras da semana)
  const [valorOrcamentoSemanal, setValorOrcamentoSemanal] = useState<number>(() => {
    try {
      const salvo = localStorage.getItem('belaped_orcamento_semanal_limite');
      return salvo ? Number(salvo) : 5000;
    } catch {
      return 5000;
    }
  });

  // Re-cotação imediata com o robô sob demanda para cada produto (Solicitado pelo Usuário)
  const [recotandoEan, setRecotandoEan] = useState<string | null>(null);

  const handleRecotarProduto = async (item: FaltaItem7d) => {
    if (!item.ean) {
      addToast('Este produto não possui código EAN cadastrado para cotação.', 'warning');
      return;
    }
    setRecotandoEan(item.ean);
    addToast(`Iniciando re-cotação robótica para "${item.descricao}"...`, 'info');
    try {
      const res = await fetch('/api/belaped/recotar-produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ean: item.ean,
          fornecedor: 'TODOS',
          descricao: item.descricao,
          por_essencia: cotarEssenciaAtivo
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Cotação atualizada com sucesso para "${item.descricao}"!`, 'success');
        carregarDados();
      } else {
        addToast(data.error || 'Erro ao recotar produto.', 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação com os robôs: ' + err.message, 'error');
    } finally {
      setRecotandoEan(null);
    }
  };

  // Modo de Reposição Inteligente:
  // 'HOJE_URGENTES': Exibe apenas o que deve ser comprado HOJE (produtos no Melhor Dia + produtos Zerados Emergenciais)
  // 'TODOS': Exibe toda a matriz semanal inclusive retidos para outros dias
  const [filtroModoReposicao, setFiltroModoReposicao] = useState<'HOJE_URGENTES' | 'TODOS'>('HOJE_URGENTES');

  // Modal de Histórico de Preços & Tendências com Séries Temporais (Recharts)
  const [modalHistoricoPreco, setModalHistoricoPreco] = useState<{
    isOpen: boolean;
    produto: FaltaItem7d | null;
  }>({ isOpen: false, produto: null });

  // Modo Cotação por Essência (Menor Preço Geral sem restrição de marca) - Ativo por padrão
  const [cotarEssenciaAtivo, setCotarEssenciaAtivo] = useState<boolean>(true);

  // Modal de Análise e Comparação de Concorrentes por Essência Farmacológica
  const [modalConcorrentesEssencia, setModalConcorrentesEssencia] = useState<{
    isOpen: boolean;
    produto: FaltaItem7d | null;
  }>({ isOpen: false, produto: null });

  // Estado para feedback instantâneo de cópia do EAN ao clicar no link
  const [toastCopiado, setToastCopiado] = useState<string | null>(null);

  // Manipulador que copia o EAN automaticamente ao clicar para conferir o produto na distribuidora
  const handleAbrirLinkDistribuidora = (item: FaltaItem7d) => {
    if (item.ean) {
      try {
        navigator.clipboard.writeText(item.ean);
        setToastCopiado(`EAN ${item.ean} copiado para a área de transferência!`);
        setTimeout(() => setToastCopiado(null), 3000);
      } catch {}
    }
  };

  // Link inteligente do produto pesquisado na distribuidora vencedora (1º ou 2º Colocado)
  const obterLinkDistribuidoraProduto = (item: FaltaItem7d, colocacao: 1 | 2 = 1): string | null => {
    // 1. Prioriza a URL direta salva pelo robô ou gerada pelo backend (se não for URL crua/home)
    const urlDireta = colocacao === 1 ? item.url_produto_1 : item.url_produto_2;
    if (urlDireta && typeof urlDireta === 'string' && urlDireta.startsWith('http')) {
      const urlCrua = [
        'https://pedido.profarma.com.br/',
        'https://pedido.profarma.com.br',
        'https://inovacao.distrimed.com.br/produtos',
        'https://inovacao.distrimed.com.br/produtos/',
        'https://divimed.artpedidoweb.com.br/#/comprar',
        'https://divimed.artpedidoweb.com.br/#/',
        'https://divimed.artpedidoweb.com.br'
      ];
      if (!urlCrua.includes(urlDireta.trim())) {
        return urlDireta;
      }
    }

    const fornecedor = (colocacao === 1 ? item.fornecedor_1 : (item as any).fornecedor_2 || '').toUpperCase();
    if (!fornecedor || fornecedor === 'NÃO COTADO' || fornecedor.includes('SEM ESTOQUE') || fornecedor.includes('AGUARDANDO')) return null;

    const termo = item.ean || encodeURIComponent(item.descricao);
    if (fornecedor.includes('PROFARMA')) {
      return `https://pedido.profarma.com.br/novo-pedido?q=${termo}`;
    }
    if (fornecedor.includes('SOTON')) {
      return `https://sotonfarma.meuspedidos.com.br/?busca=${termo}`;
    }
    if (fornecedor.includes('DPC')) {
      return `https://dpcnet.com.br/catalogo?busca=${termo}&visualizacao=bloco-1&ordenacao=ordem-0`;
    }
    if (fornecedor.includes('MARTINS')) {
      return `https://www.martinsatacado.com.br/busca?q=${termo}`;
    }
    if (fornecedor.includes('DISTRIMED')) {
      return `https://inovacao.distrimed.com.br/produtos?pesquisa=${termo}`;
    }
    if (fornecedor.includes('DIVIMED')) {
      return `https://divimed.artpedidoweb.com.br/#/comprar?busca=${termo}`;
    }
    return null;
  };

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
      if (f1Upper.includes('PROFARMA') || f1Upper.includes('DPC') || f1Upper.includes('MARTINS')) {
        melhorDiaIdx = 2; // Terça
      } else if (f1Upper.includes('SOTON')) {
        melhorDiaIdx = 3; // Quarta
      } else if (f1Upper.includes('DISTRIMED') || f1Upper.includes('DIVIMED')) {
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

      // REGRA DE OURO: Produtos Desejados sempre têm status MELHOR_DIA e quantidade exata solicitada
      let statusDia: 'MELHOR_DIA' | 'EMERGENCIAL_RUPTURA' | 'RETIDO_OUTRO_DIA' = 'MELHOR_DIA';
      let qtdFinal = equalizada;
      let qtdEmergencial: number | undefined = undefined;

      if (item.is_desejado) {
        statusDia = 'MELHOR_DIA';
        qtdFinal = bruta;
      } else if (melhorDiaIdx === hojeDiaSemana) {
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

      if ((item as any).qtd_manual_override !== undefined) {
        qtdFinal = Math.max(1, Number((item as any).qtd_manual_override) || 1);
      }

      if (bruta > qtdFinal) {
        unCortadas += (bruta - qtdFinal);
        reaisEconomizados += (bruta - qtdFinal) * precoRef;
      }

      // Cálculo resiliente da Prioridade (garante que P1, P2, P3 e P4 nunca sejam 0 ou undefined)
      const isCurvaAlta = item.curva_abc === 'A' || item.curva_abc === 'B';
      const diasCobertura = vmd > 0 && saldoFisico > 0 ? (saldoFisico / vmd) : 0;
      let prioridadeFinal: 'P1' | 'P2' | 'P3' | 'P4' = (item.prioridade as any) || 'P4';
      let prioridadeRotuloFinal: string = item.prioridade_rotulo || 'Regular';

      if (item.is_desejado) {
        prioridadeFinal = 'P1';
        prioridadeRotuloFinal = '⭐ Desejado';
      } else if (!item.prioridade || item.prioridade === 'P4') {
        if (saldoFisico <= 0 && isCurvaAlta) {
          prioridadeFinal = 'P1';
          prioridadeRotuloFinal = 'Ruptura Crítica';
        } else if (saldoFisico <= 0 && !isCurvaAlta) {
          prioridadeFinal = (hist6m > 0 || item.is_esquecido_6m) ? 'P2' : 'P4';
          prioridadeRotuloFinal = prioridadeFinal === 'P2' ? 'Risco Iminente' : 'Regular';
        } else if (isCurvaAlta && (diasCobertura <= 3 || saldoFisico <= Math.max(1, vmd * 3))) {
          prioridadeFinal = 'P2';
          prioridadeRotuloFinal = 'Risco Iminente';
        } else if (hist6m > 0 || isCurvaAlta) {
          prioridadeFinal = 'P3';
          prioridadeRotuloFinal = 'Orçamento Semanal';
        } else {
          prioridadeFinal = 'P4';
          prioridadeRotuloFinal = 'Regular';
        }
      }

      return {
        ...item,
        prioridade: prioridadeFinal,
        prioridade_rotulo: prioridadeRotuloFinal,
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
  const [alvoVencimento, setAlvoVencimento] = useState<'AUTOMATICO' | 'PROXIMO_MES' | 'LONGO' | 'TODOS'>('AUTOMATICO');
  const [itensRepassados, setItensRepassados] = useState<any[]>([]);
  const [itensFiltradosPorPrazo, setItensFiltradosPorPrazo] = useState<any[]>([]);

  // Relatório de Preços
  const [relatorioPrecos, setRelatorioPrecos] = useState<any[]>([]);

  // Cotação ao Vivo com Robô
  const [cotandoAoVivo, setCotandoAoVivo] = useState(false);
  const [reiniciandoCotacao, setReiniciandoCotacao] = useState(false);
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

  // Montagem Robótica de Carrinho na DPC Distribuidora
  const [montandoCarrinhoDpc, setMontandoCarrinhoDpc] = useState(false);
  const [statusCarrinhoDpc, setStatusCarrinhoDpc] = useState<{
    emAndamento: boolean;
    total: number;
    atual: number;
    sucessos: number;
    erros: number;
    ultimoItem?: string;
  } | null>(null);

  // Montagem Robótica de Carrinho na Profarma
  const [montandoCarrinhoProfarma, setMontandoCarrinhoProfarma] = useState(false);
  const [statusCarrinhoProfarma, setStatusCarrinhoProfarma] = useState<{
    emAndamento: boolean;
    total: number;
    atual: number;
    sucessos: number;
    erros: number;
    ultimoItem?: string;
  } | null>(null);

  // Montagem Robótica de Carrinho no Martins Atacado
  const [montandoCarrinhoMartins, setMontandoCarrinhoMartins] = useState(false);
  const [statusCarrinhoMartins, setStatusCarrinhoMartins] = useState<{
    emAndamento: boolean;
    total: number;
    atual: number;
    sucessos: number;
    erros: number;
    ultimoItem?: string;
  } | null>(null);

  // Importação Robótica na Modal da Distrimed
  const [importandoDistrimed, setImportandoDistrimed] = useState(false);
  const [statusImportDistrimed, setStatusImportDistrimed] = useState<{
    emAndamento: boolean;
    mensagem: string;
    sucesso: boolean;
  } | null>(null);

  // Montagem Robótica de Carrinho na Divimed
  const [montandoCarrinhoDivimed, setMontandoCarrinhoDivimed] = useState(false);
  const [statusCarrinhoDivimed, setStatusCarrinhoDivimed] = useState<{
    emAndamento: boolean;
    total: number;
    atual: number;
    sucessos: number;
    erros: number;
    ultimoItem?: string;
  } | null>(null);

  // Montagem Robótica de Carrinho na Oriente Farma
  const [montandoCarrinhoOriente, setMontandoCarrinhoOriente] = useState(false);
  const [statusCarrinhoOriente, setStatusCarrinhoOriente] = useState<{
    emAndamento: boolean;
    total: number;
    atual: number;
    sucessos: number;
    erros: number;
    ultimoItem?: string;
  } | null>(null);

  // Relatório de Auditoria e Repasse do Carrinho do Robô
  const [modalRelatorioAberto, setModalRelatorioAberto] = useState(false);
  const [ultimoRelatorioAuditoria, setUltimoRelatorioAuditoria] = useState<any | null>(null);
  const [abaRelatorioAuditoria, setAbaRelatorioAuditoria] = useState<'TODOS' | 'ADICIONADOS' | 'REPASSADOS' | 'SEM_ESTOQUE'>('TODOS');
  const [buscaRelatorioAuditoria, setBuscaRelatorioAuditoria] = useState('');

  // Orquestrador Sequencial de Montagem de Todos os Carrinhos
  const [montandoTodosCarrinhos, setMontandoTodosCarrinhos] = useState(false);
  const [statusTodosCarrinhos, setStatusTodosCarrinhos] = useState<{
    emAndamento: boolean;
    totalDistribuidoras: number;
    distribuidoraAtualIndex: number;
    distribuidoraAtualNome: string;
    totalItensDistribuidora: number;
    itemAtualIndex: number;
    ultimoItem: string;
    itensSucessoTotal: number;
    itensErroTotal: number;
    carrinhosProcessados: any[];
  } | null>(null);

  // Modal Unificada "Ver Carrinhos" com Guias (Abas) de cada Distribuidora Cotada
  const [carrinhoModalAberto, setCarrinhoModalAberto] = useState(false);
  const [carrinhoModalSelecionado, setCarrinhoModalSelecionado] = useState<any | null>(null);
  const [abaEmpresaModalIndex, setAbaEmpresaModalIndex] = useState<number>(0);
  const [prazoSelecionadoModal, setPrazoSelecionadoModal] = useState<string>('');
  const [lancandoPedidoBelinha, setLancandoPedidoBelinha] = useState<boolean>(false);

  // Pesquisa Global no Estoque Real da Farmácia com Justificativa do Sistema (em Modal ampla)
  const [resultadosEstoqueReal, setResultadosEstoqueReal] = useState<any[]>([]);
  const [resumoPesquisaEstoqueReal, setResumoPesquisaEstoqueReal] = useState<any | null>(null);
  const [filtroModalEstoque, setFiltroModalEstoque] = useState<'TODOS' | 'COM_VENDAS' | 'COM_ESTOQUE' | 'ZERADOS_GIRO' | 'SEM_GIRO'>('TODOS');
  const [selecaoModalEstoque, setSelecaoModalEstoque] = useState<Record<number, boolean>>({});
  const [buscandoEstoqueReal, setBuscandoEstoqueReal] = useState<boolean>(false);
  const [qtdIncluirEstoque, setQtdIncluirEstoque] = useState<Record<number, number>>({});
  const [modalEstoqueRealAberto, setModalEstoqueRealAberto] = useState<boolean>(false);
  const [modalDesejadosAberto, setModalDesejadosAberto] = useState<boolean>(false);
  const [salvandoDesejadosLote, setSalvandoDesejadosLote] = useState<boolean>(false);

  // Compra Direta nos Portais
  const [comprandoDireto, setComprandoDireto] = useState(false);
  const [distribuidoraComprando, setDistribuidoraComprando] = useState<string | null>(null);
  const [resultadoUltimaCompra, setResultadoUltimaCompra] = useState<any | null>(null);

  // Wizard "Comprar Todos" (Passo a Passo Assistido)
  const [wizardComprarTodosAberto, setWizardComprarTodosAberto] = useState(false);
  const [wizardEtapaAtual, setWizardEtapaAtual] = useState(0);
  const [wizardPrazosPorDist, setWizardPrazosPorDist] = useState<Record<string, string>>({});
  const [wizardHistoricoResultados, setWizardHistoricoResultados] = useState<any[]>([]);

  // Registro de horário da última sincronização para feedback visual
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('');

  // Carrega todos os dados iniciais (ou apenas dados de cotações de forma leve em background)
  const carregarDados = async (apenasCotacoes: boolean = false) => {
    try {
      if (!apenasCotacoes) {
        setRefreshing(true);
      }

      const janelaQuery = janelaAlvoSelecionada ? `&janelaMes=${encodeURIComponent(janelaAlvoSelecionada)}` : '';

      // Se for apenas atualização dinâmica de cotação, consulta apenas faltas-7d e relatorio-precos (rápido, ~50ms)
      const requisicoes = apenasCotacoes
        ? [
            fetch(`/api/belaped/faltas-7d?equalizar=${equalizarAtivo ? '1' : '0'}&teto_max=${tetoMaxUnidades}${janelaQuery}`),
            fetch('/api/belaped/relatorio-precos')
          ]
        : [
            fetch('/api/belaped/orcamento-boletos'),
            fetch(`/api/belaped/faltas-7d?equalizar=${equalizarAtivo ? '1' : '0'}&teto_max=${tetoMaxUnidades}${janelaQuery}`),
            fetch('/api/belaped/portais'),
            fetch('/api/belaped/relatorio-precos')
          ];

      const respostas = await Promise.all(requisicoes);
      const resFaltas = apenasCotacoes ? respostas[0] : respostas[1];
      const resRel = apenasCotacoes ? respostas[1] : respostas[3];

      if (!apenasCotacoes) {
        const resOrc = respostas[0];
        const resPortais = respostas[2];
        if (resOrc && resOrc.ok) {
          const dataOrc = await resOrc.json();
          setOrcamentoInfo(dataOrc);
          if (!janelaAlvoSelecionada && Array.isArray(dataOrc.janelasDisponiveis) && dataOrc.janelasDisponiveis.length > 0) {
            const primeiraLiberada = dataOrc.janelasDisponiveis.find((j: any) => j.statusOrcamento === 'LIBERADO') || dataOrc.janelasDisponiveis[0];
            if (primeiraLiberada) {
              setJanelaAlvoSelecionada(primeiraLiberada.chave);
              try { localStorage.setItem('belaped_janela_alvo', primeiraLiberada.chave); } catch {}
            }
          }
        }
        if (resPortais && resPortais.ok) {
          const dataPortais = await resPortais.json();
          setPortais(dataPortais.portais || []);
        }
        carregarAuditoriaPrazos();
        carregarCampanhasDistrimed();
      }

      if (resFaltas && resFaltas.ok) {
        const dataFaltas = await resFaltas.json();
        setFaltasRaw(dataFaltas.items || []);
        setItensAvulsos(dataFaltas.itens_avulsos || []);
        setFaltasBalcaoBelinha(dataFaltas.faltas_balcao_belinha_lista || []);
        setStatsAntiRuptura({
          ocultadosEquiv: Number(dataFaltas.ocultados_equivalente_com_estoque) || 0,
          agrupadosEquiv: Number(dataFaltas.agrupados_equivalencia) || 0,
          totalEsquecidos6m: Number(dataFaltas.total_esquecidos_6m) || 0
        });
        
        // A lista começa vazia ({}) e só recebe os itens que o usuário aprovar nos cards ("Comprar" / "Optar pelo 2º") ou marcar manualmente.
        // Em atualizações automáticas, preserva a seleção do usuário desmarcando apenas o que já foi enviado ao carrinho ou bloqueado.
        setItensSelecionados(prev => {
          if (Object.keys(prev).length === 0) return prev;
          const itemsList: any[] = dataFaltas.items || [];
          const atualizado = { ...prev };
          itemsList.forEach((item: any) => {
            if (item.is_enviado_carrinho_semana || item.nao_carrinho || item.nao_cotar || item.is_adiado_proxima_semana) {
              delete atualizado[item.produto_id];
            }
          });
          return atualizado;
        });
      }

      if (resRel && resRel.ok) {
        const dataRel = await resRel.json();
        setRelatorioPrecos(dataRel.produtos || []);
      }

      setUltimaAtualizacao(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    } catch (e: any) {
      if (!apenasCotacoes) {
        addToast('Erro ao sincronizar dados do BelaPed: ' + e.message, 'error');
      }
    } finally {
      if (!apenasCotacoes) {
        setLoading(false);
        setRefreshing(false);
      }
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
      // Se for produto desejado (belaped_itens_avulsos), ele tem prioridade máxima e nunca é ocultado por regras de dia
      if (f.is_desejado) {
        if (filtroCurva === 'DESEJADOS') {
          // Mantém
        } else if (filtroCurva !== 'TODAS') {
          // Se selecionou Curva A, B, C ou Esquecidos, respeita se bater
          if (filtroCurva === 'ESQUECIDOS_6M' && !f.is_esquecido_6m) return false;
          if (['A', 'B', 'C'].includes(filtroCurva) && f.curva_abc !== filtroCurva) return false;
        }
        if (buscaFalta) {
          const termo = buscaFalta.toLowerCase();
          const bateNome = f.descricao.toLowerCase().includes(termo);
          const bateEan = f.ean && f.ean.includes(termo);
          if (!bateNome && !bateEan) return false;
        }
        return true;
      }

      if (filtroCurva === 'DESEJADOS') {
        return false;
      }

      // Se estiver forçado no modo de urgência estrita, exibe apenas os produtos que têm urgência real (saldo <= 0 ou dias <= 0)
      if (modoListaManual === 'URGENCIA' && f.saldo > 0 && f.dias_estoque_restante > 0) {
        return false;
      }

      // No modo padrão 'HOJE_URGENTES', retém produtos cujo melhor dia é outro dia e que ainda têm estoque físico
      if (filtroModoReposicao === 'HOJE_URGENTES' && f.status_dia === 'RETIDO_OUTRO_DIA') {
        return false;
      }
      // Filtro de Faltas do Balcão do Belinha (Livro de Faltas)
      if (filtroApenasBalcao && !f.falta_balcao_belinha) {
        return false;
      }
      if (filtroCurva === 'ESQUECIDOS_6M') {
        if (!f.is_esquecido_6m) return false;
      } else if (filtroCurva !== 'TODAS' && f.curva_abc !== filtroCurva) {
        return false;
      }
      if (filtroPrioridade !== 'TODAS' && f.prioridade !== filtroPrioridade) {
        return false;
      }
      if (filtroCategoria !== 'TODAS' && f.tipo_categoria !== filtroCategoria) return false;
      // Filtro de Regras de Produtos (Bloqueados para Carrinho, Não Cotar, Liberados ou Adiados p/ Próx. Semana)
      if (filtroRegras === 'BLOQUEADOS_CARRINHO' && !f.nao_carrinho) {
        return false;
      }
      if (filtroRegras === 'NAO_COTAR' && !f.nao_cotar) {
        return false;
      }
      if (filtroRegras === 'ADIADOS_PROXIMA_SEMANA' && !f.is_adiado_proxima_semana) {
        return false;
      }
      if (filtroRegras === 'LIBERADOS' && (f.nao_carrinho || f.nao_cotar || f.is_adiado_proxima_semana)) {
        return false;
      }
      if (buscaFalta) {
        const termo = buscaFalta.toLowerCase();
        const bateNome = f.descricao.toLowerCase().includes(termo);
        const bateEan = f.ean && f.ean.includes(termo);
        if (!bateNome && !bateEan) return false;
      }
      return true;
    });
  }, [faltas, modoListaManual, filtroModoReposicao, filtroApenasBalcao, filtroCurva, filtroPrioridade, filtroCategoria, filtroRegras, buscaFalta]);

  // Calcula os totais consolidados por empresa/distribuidora (1º Colocado)
  const totaisPorDistribuidora = useMemo(() => {
    const minimosPadrao: Record<string, number> = {
      'DISTRIMED': 350,
      'PROFARMA': 150,
      'SOTON FARMA': 300,
      'DPC DISTRIBUIDORA': 300,
      'DIVIMED': 400,
      'MARTINS ATACADO': 200,
      'MARTINS': 200,
      'ORIENTE FARMA': 150,
      'ORIENTE': 150,
      'PANPHARMA': 300,
      'PANFARMA': 300,
      'MG MEDICAMENTOS': 300,
      'MGMEDICAMENTOS': 300,
      'MG': 300,
      'STOCKFARMA': 300,
      'ORGAFARMA': 300,
      'FARMIX': 300,
      'HYMPARHUB': 300,
      'HYMPAR': 300
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
      const chave = isReal ? f1.toUpperCase() : (f1 === 'Sem Estoque (Portais)' ? 'SEM ESTOQUE (9 PORTAIS)' : 'AGUARDANDO ROBÔ');

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
      const isNumericoDesc = ['qtd_sugerida_7d', 'preco_ult_compra', 'preco_1', 'preco_2', 'margem_lucro_percentual', 'subtotal_7d', 'ranking_posicao'].includes(coluna as string);
      setOrdenarDirecao(coluna === 'ranking_posicao' ? 'asc' : (isNumericoDesc ? 'desc' : 'asc'));
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
          const chave = isReal ? f1.toUpperCase() : (f1 === 'Sem Estoque (Portais)' ? 'SEM ESTOQUE (9 PORTAIS)' : 'AGUARDANDO ROBÔ');
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
  }, [filtroCurva, filtroPrioridade, filtroCategoria, filtroDistribuidora, buscaFalta, itensPorPagina]);

  // Pesquisa em tempo real no Estoque Real completo da farmácia ao digitar na barra de busca
  useEffect(() => {
    const termo = buscaFalta.trim();
    if (termo.length < 2) {
      setResultadosEstoqueReal([]);
      setBuscandoEstoqueReal(false);
      return;
    }

    let cancelado = false;
    setBuscandoEstoqueReal(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/belaped/buscar-estoque-real?q=${encodeURIComponent(termo)}`);
        if (res.ok && !cancelado) {
          const data = await res.json();
          const lista = data.produtos || data.resultados || [];
          setResultadosEstoqueReal(lista);
          setResumoPesquisaEstoqueReal(data.resumo_pesquisa || null);
          // Se o produto pesquisado não está na tabela de faltas atual (ou digitou um EAN), abre automaticamente a Modal ampla de leitura
          if (lista.length > 0 && faltasFiltradas.length === 0) {
            setModalEstoqueRealAberto(true);
          }
        }
      } catch (e) {
        if (!cancelado) {
          setResultadosEstoqueReal([]);
          setResumoPesquisaEstoqueReal(null);
        }
      } finally {
        if (!cancelado) setBuscandoEstoqueReal(false);
      }
    }, 350);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [buscaFalta, faltasFiltradas.length]);

  // Gravar produto individualmente em "Produtos Desejados" (e cotação prioritária P1)
  const handleGravarProdutoDesejado = async (prod: any, qtdManual?: number) => {
    try {
      const qtd = Math.max(1, Number(qtdManual ?? qtdIncluirEstoque[prod.produto_id] ?? prod.qtd_sugerida ?? 2) || 2);
      const precoRef = Number(prod.preco_ult_compra || prod.custo_unitario) > 0 ? Number(prod.preco_ult_compra || prod.custo_unitario) : 5.0;
      const res = await fetch('/api/belaped/itens-avulsos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: prod.descricao,
          ean: prod.ean || '',
          quantidade: qtd,
          preco_referencia: precoRef,
          motivo: '⭐ Gravado em Produtos Desejados',
          usuario: user.name || 'Comprador'
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`⭐ "${prod.descricao}" (${qtd} un) salvo nos Produtos Desejados e adicionado na fila de cotação P1!`, 'success');
        setResultadosEstoqueReal(prev => prev.map(r => r.produto_id === prod.produto_id ? {
          ...r,
          is_desejado: true,
          ja_na_cotacao: true,
          id_desejado: data.item?.id || r.id_desejado,
          justificativa_compra: `⭐ Produto gravado na sua lista de Produtos Desejados (${qtd} un) — já está na fila de cotação dos robôs!`
        } : r));
        carregarDados();
      } else {
        addToast(data.error || 'Erro ao gravar produto desejado', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao salvar produto desejado: ' + err.message, 'error');
    }
  };

  // Gravar múltiplos produtos selecionados em lote nos "Produtos Desejados"
  const handleGravarDesejadosLote = async () => {
    const selecionados = resultadosEstoqueReal.filter(p => selecaoModalEstoque[p.produto_id]);
    if (selecionados.length === 0) {
      addToast('Selecione pelo menos um produto para gravar nos Desejados.', 'info');
      return;
    }
    try {
      setSalvandoDesejadosLote(true);
      const itensPayload = selecionados.map(p => ({
        descricao: p.descricao,
        ean: p.ean || '',
        quantidade: Math.max(1, Number(qtdIncluirEstoque[p.produto_id] ?? p.qtd_sugerida ?? 2) || 2),
        preco_referencia: Number(p.preco_ult_compra || p.custo_unitario || 5.0),
        motivo: `⭐ Lote de Produtos Desejados (${buscaFalta.trim()})`,
        usuario: user.name || 'Comprador'
      }));

      const res = await fetch('/api/belaped/itens-avulsos/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensPayload })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`⭐ ${selecionados.length} produto(s) gravado(s) com sucesso nos Produtos Desejados!`, 'success');
        setSelecaoModalEstoque({});
        setResultadosEstoqueReal(prev => prev.map(r => selecaoModalEstoque[r.produto_id] ? {
          ...r,
          is_desejado: true,
          ja_na_cotacao: true,
          justificativa_compra: `⭐ Produto gravado na sua lista de Produtos Desejados — já está na fila de cotação dos robôs!`
        } : r));
        carregarDados();
      } else {
        addToast(data.error || 'Erro ao salvar produtos em lote', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao salvar lote: ' + err.message, 'error');
    } finally {
      setSalvandoDesejadosLote(false);
    }
  };

  // Remover produto dos "Produtos Desejados"
  const handleRemoverDesejado = async (id: string | number, desc?: string) => {
    try {
      const res = await fetch(`/api/belaped/itens-avulsos/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        addToast(`"${desc || 'Produto'}" removido dos Produtos Desejados.`, 'info');
        setResultadosEstoqueReal(prev => prev.map(r => r.id_desejado === id ? { ...r, is_desejado: false } : r));
        carregarDados();
      } else {
        addToast(data.error || 'Erro ao remover dos desejados', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao remover dos desejados: ' + err.message, 'error');
    }
  };

  // Atualizar quantidade de um item nos "Produtos Desejados"
  const handleAtualizarQtdDesejado = async (id: string | number, novaQtd: number) => {
    if (novaQtd < 1) return;
    try {
      const res = await fetch(`/api/belaped/itens-avulsos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantidade: novaQtd })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Quantidade atualizada para ${novaQtd} un.`, 'success');
        carregarDados();
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  // Alias para incluir na cotação diretamente (grava nos desejados)
  const handleIncluirDoEstoqueRealNaCotacao = (prod: any) => handleGravarProdutoDesejado(prod);

  const totalPaginas = Math.max(1, Math.ceil(faltasFiltradas.length / itensPorPagina));

  // Itens fatiados para a página atual
  const itensPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    return faltasFiltradas.slice(inicio, inicio + itensPorPagina);
  }, [faltasFiltradas, paginaAtual, itensPorPagina]);

  // Itens com grande divergência de preço vs última compra (>= 40% mais barato ou >= 60% mais caro)
  const itensDivergentes = useMemo(() => {
    return faltasFiltradas.filter(item => {
      const p1 = Number(item.preco_1) || 0;
      const pUlt = Number(item.preco_ult_compra ?? item.custo_unitario ?? 0);
      if (p1 > 0 && pUlt > 0) {
        const diff = ((p1 - pUlt) / pUlt) * 100;
        return diff <= -40 || diff >= 60;
      }
      return false;
    });
  }, [faltasFiltradas]);

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

  // Dados da Janela Alvo de Orçamento Ativa (selecionada pelo usuário)
  const janelaAtivaData = useMemo(() => {
    if (orcamentoInfo?.janelasDisponiveis && orcamentoInfo.janelasDisponiveis.length > 0) {
      if (janelaAlvoSelecionada) {
        const achada = orcamentoInfo.janelasDisponiveis.find(j => j.chave === janelaAlvoSelecionada);
        if (achada) return achada;
      }
      return orcamentoInfo.janelasDisponiveis.find(j => j.statusOrcamento === 'LIBERADO') || orcamentoInfo.janelasDisponiveis[0];
    }
    return orcamentoInfo?.mesAtual || null;
  }, [orcamentoInfo, janelaAlvoSelecionada]);

  // Análise da Cota Semanal Enxuta (80% para compras, 20% retido como economia)
  const analiseOrcamentoSemanal = useMemo(() => {
    const saldoLivreMes = Math.max(0, janelaAtivaData?.saldoLivre ?? 0);
    const limiteTotalMes = Math.max(0, janelaAtivaData?.limite ?? 0);
    const totalComprometidoMes = Math.max(0, janelaAtivaData?.totalComprometido ?? 0);
    const limiteSemanalBruto = Math.max(0, (janelaAtivaData as any)?.cotaSemanalLivre ?? Number((saldoLivreMes / ((janelaAtivaData as any)?.qtdSemanas || 4)).toFixed(2)));
    
    // Regra acordada no grill-me: 80% do teto semanal para compras da semana (enxugamento), 20% guardado como reserva de caixa
    const cotaSemanalSegura = Math.max(0, (janelaAtivaData as any)?.cotaSemanalSegura ?? Number((limiteSemanalBruto * 0.8).toFixed(2)));
    const reservaSeguranca = Math.max(0, (janelaAtivaData as any)?.reservaSeguranca ?? Number((limiteSemanalBruto * 0.2).toFixed(2)));

    const valorSelecionado = totaisSelecionados.valorTotal;
    const estaDentroDaCota = valorSelecionado <= cotaSemanalSegura;
    const diferencaCota = Number((cotaSemanalSegura - valorSelecionado).toFixed(2));
    const percentualUsoCota = cotaSemanalSegura > 0 ? Math.min(150, Number(((valorSelecionado / cotaSemanalSegura) * 100).toFixed(1))) : 0;

    return {
      limiteTotalMes,
      totalComprometidoMes,
      saldoLivreMes,
      limiteSemanalBruto,
      cotaSemanalSegura,
      reservaSeguranca,
      valorSelecionado,
      estaDentroDaCota,
      diferencaCota,
      percentualUsoCota
    };
  }, [janelaAtivaData, totaisSelecionados.valorTotal]);

  // Divisão em "Itens na Cota Semanal" vs "Banco de Espera (Próximos da Fila)" com Efeito Cascata
  const { itensNaCotaSemanal, itensBancoEspera } = useMemo(() => {
    const tetoSeguro = analiseOrcamentoSemanal.cotaSemanalSegura;
    const dentro: FaltaItem7d[] = [];
    const espera: FaltaItem7d[] = [];
    let acumulado = 0;

    faltasFiltradas.forEach(it => {
      const isBloqueado = Boolean(it.nao_carrinho || it.nao_cotar || it.is_adiado_proxima_semana || it.is_ja_pedido);
      const isSelected = Boolean(itensSelecionados[it.produto_id]);

      if (isBloqueado) {
        espera.push(it);
        return;
      }

      const sub = Number(it.subtotal_7d || 0);
      if (isSelected) {
        if (acumulado + sub <= tetoSeguro || dentro.length === 0) {
          dentro.push(it);
          acumulado += sub;
        } else {
          espera.push(it);
        }
      } else {
        espera.push(it);
      }
    });

    return { itensNaCotaSemanal: dentro, itensBancoEspera: espera };
  }, [faltasFiltradas, itensSelecionados, analiseOrcamentoSemanal.cotaSemanalSegura]);

  // Ação rápida para pré-selecionar os produtos mais urgentes até o teto de 80% da semana
  const handleAutoPreencherCotaSemanal = () => {
    const teto = analiseOrcamentoSemanal.cotaSemanalSegura;
    if (teto <= 0) {
      addToast('Saldo livre da janela insuficiente para compras nesta semana.', 'warning');
      return;
    }

    let acumulado = 0;
    const novoSel: Record<number, boolean> = {};
    let count = 0;

    faltasFiltradas.forEach(it => {
      const isBloqueado = Boolean(it.nao_carrinho || it.nao_cotar || it.is_adiado_proxima_semana || it.is_ja_pedido);
      if (isBloqueado) return;

      const sub = Number(it.subtotal_7d || 0);
      if (acumulado + sub <= teto) {
        novoSel[it.produto_id] = true;
        acumulado += sub;
        count++;
      }
    });

    setItensSelecionados(novoSel);
    addToast(`Cota semanal enxuta preenchida! ${count} produtos de extrema necessidade selecionados (R$ ${acumulado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}), preservando 20% de reserva de caixa.`, 'success');
  };

  // Alternar Janela Alvo de Orçamento
  const handleMudarJanelaAlvo = (novaChave: string) => {
    setJanelaAlvoSelecionada(novaChave);
    try { localStorage.setItem('belaped_janela_alvo', novaChave); } catch {}
    setRefreshing(true);
    setTimeout(() => {
      carregarDados(false);
    }, 50);
  };

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

  // Adapta a lista selecionando estritamente os produtos mais prioritários (P1 > P2 > Curva A) até o teto semanal
  const handleAdaptarListaAoOrcamento = (limiteCustom?: number) => {
    const teto = Number(limiteCustom ?? valorOrcamentoSemanal) || 0;
    if (teto <= 0) {
      addToast('Digite um valor de orçamento semanal válido (maior que R$ 0,00)', 'warning');
      return;
    }

    // Hierarquia de Urgência:
    // 1º P1 (Zerados Críticos de Curva A e B)
    // 2º P2 (Risco Iminente de 1 a 3 dias)
    // 3º P3 (Orçamento / Curva C com giro)
    // 4º P4 (Demais itens regulares)
    const pesoPrio: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
    const itensOrdenados = [...faltas].sort((a, b) => {
      const pa = pesoPrio[a.prioridade] || 4;
      const pb = pesoPrio[b.prioridade] || 4;
      if (pa !== pb) return pa - pb;

      if (a.saldo <= 0 && b.saldo > 0) return -1;
      if (b.saldo <= 0 && a.saldo > 0) return 1;

      const pesoCurva: Record<string, number> = { A: 3, B: 2, C: 1 };
      const pA = pesoCurva[a.curva_abc] || 0;
      const pB = pesoCurva[b.curva_abc] || 0;
      if (pA !== pB) return pB - pA;

      return (b.vmd_ponderado || 0) - (a.vmd_ponderado || 0);
    });

    let acumulado = 0;
    const novoSel: Record<number, boolean> = {};
    let selecionadosCount = 0;
    let p1Count = 0;
    let p2Count = 0;

    itensOrdenados.forEach(it => {
      const subtotal = Number(it.subtotal_7d) || 0;
      if (subtotal <= 0) return;

      if (acumulado + subtotal <= teto || selecionadosCount === 0) {
        novoSel[it.produto_id] = true;
        acumulado += subtotal;
        selecionadosCount++;
        if (it.prioridade === 'P1') p1Count++;
        else if (it.prioridade === 'P2') p2Count++;
      } else {
        novoSel[it.produto_id] = false;
      }
    });

    setItensSelecionados(novoSel);
    try {
      localStorage.setItem('belaped_orcamento_semanal_limite', String(teto));
    } catch {}

    addToast(
      `Lista adaptada ao orçamento! R$ ${acumulado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} selecionados em ${selecionadosCount} produtos prioritários (${p1Count} P1 Críticos, ${p2Count} P2 Risco).`,
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

  // Adicionar item da Guia de Faltas do Balcão (Livro de Faltas) na Cotação do BelaPed
  const handleAdicionarFaltaBalcaoACotacao = async (faltaBalcao: any) => {
    try {
      const res = await fetch('/api/belaped/itens-avulsos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: faltaBalcao.productName,
          ean: '',
          quantidade: 5,
          preco_referencia: 10.0,
          motivo: `Falta do Balcão (${faltaBalcao.userName || 'Balconista'}${faltaBalcao.clientInquiry ? ' • Cliente procurou' : ''}${faltaBalcao.notes ? ` • Obs: ${faltaBalcao.notes}` : ''})`,
          usuario: user.name || 'BelaPed'
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`"${faltaBalcao.productName}" incluído na cotação do BelaPed!`, 'success');
        carregarDados();
      } else {
        addToast(data.error || 'Erro ao incluir falta do balcão', 'error');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  // Executar Otimização Real de Carrinhos (Dissolve empresas abaixo do mínimo usando preços reais cotados nos 7 portais)
  const handleExecutarSimulacao = async (abrirModalAutomatico: boolean = true, distribuidoraFoco?: string) => {
    try {
      setSimulando(true);
      const selecionados = faltas.filter(
        f => itensSelecionados[f.produto_id] && !f.nao_carrinho && !f.nao_cotar && !f.is_adiado_proxima_semana && !f.is_enviado_carrinho_semana
      );

      if (selecionados.length === 0) {
        addToast('Sua lista está vazia. Clique em "Comprar" nos cards para adicionar produtos à lista.', 'warning');
        return;
      }

      // Envia payload enxuto para evitar erro HTTP 413 (Payload Too Large) / 502 no proxy reverso
      const itensEnxutos = selecionados.map(f => ({
        produto_id: f.produto_id,
        ean: f.ean,
        descricao: f.descricao,
        apresentacao: f.apresentacao,
        curva_abc: f.curva_abc,
        saldo: f.saldo,
        qtd_sugerida_7d: f.qtd_sugerida_7d,
        subtotal_7d: f.subtotal_7d,
        fornecedor_1: f.fornecedor_1,
        preco_1: f.preco_1,
        url_produto_1: f.url_produto_1,
        fornecedor_2: f.fornecedor_2,
        preco_2: f.preco_2,
        url_produto_2: f.url_produto_2,
        preco_ult_compra: f.preco_ult_compra,
        custo_unitario: f.custo_unitario,
        fornecedor_ult_compra: f.fornecedor_ult_compra
      }));

      const res = await fetch('/api/belaped/simular-otimizacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: itensEnxutos,
          alvoVencimento
        })
      });

      if (res.ok) {
        const data = await res.json();
        const listaCarrinhos = data.carrinhos || [];
        setCarrinhosOtimizados(listaCarrinhos);
        setResumoSimulacao(data.resumo || null);
        setSugestoesReagrupamento(data.sugestoesReagrupamento || []);
        setItensRepassados(data.itensRepassados || []);
        setItensFiltradosPorPrazo(data.itensFiltradosPorPrazo || []);

        // Atualiza imediatamente a tabela principal com os itens repassados das distribuidoras que não atingiram o mínimo
        if (Array.isArray(data.itensRepassados) && data.itensRepassados.length > 0) {
          const mapaRepasse = new Map<string, any>();
          data.itensRepassados.forEach((rep: any) => {
            if (rep.ean) mapaRepasse.set(String(rep.ean).trim(), rep);
            if (rep.produto) mapaRepasse.set(String(rep.produto).trim().toUpperCase(), rep);
          });

          setFaltasRaw(prev => prev.map(f => {
            const rep = (f.ean && mapaRepasse.get(String(f.ean).trim())) || mapaRepasse.get(String(f.descricao).trim().toUpperCase());
            if (!rep) return f;
            const novoPreco = Number(rep.precoPara) || f.preco_1 || f.custo_unitario;
            const qtd = Number(f.qtd_sugerida_7d) || 1;
            return {
              ...f,
              fornecedor_1: rep.para,
              preco_1: novoPreco,
              subtotal_7d: Number((qtd * novoPreco).toFixed(2)),
              repassado_de: rep.de
            };
          }));

          addToast(
            `✨ Carrinhos otimizados! ${data.itensRepassados.length} produto(s) de empresas abaixo do mínimo foram redistribuídos automaticamente.`,
            'success'
          );
        } else {
          addToast('✨ Lista de carrinhos atualizada com sucesso!', 'success');
        }

        if (abrirModalAutomatico && listaCarrinhos.length > 0) {
          let idx = 0;
          if (distribuidoraFoco) {
            const achou = listaCarrinhos.findIndex(
              (c: any) => String(c.distribuidora).toUpperCase() === String(distribuidoraFoco).toUpperCase()
            );
            if (achou >= 0) idx = achou;
          }
          setAbaEmpresaModalIndex(idx);
          setCarrinhoModalSelecionado(listaCarrinhos[idx]);
          setPrazoSelecionadoModal(listaCarrinhos[idx].boletoEleito || `${listaCarrinhos[idx].prazoDias || 28} DDL`);
          setCarrinhoModalAberto(true);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        addToast(errData.error || `Erro ao abrir lista (HTTP ${res.status})`, 'error');
      }
    } catch (e: any) {
      addToast('Erro na otimização: ' + e.message, 'error');
    } finally {
      setSimulando(false);
    }
  };

  // Abrir a Modal Unificada "Ver Carrinhos" sempre sincronizada com os itens selecionados atualmente
  const handleAbrirModalVerCarrinhos = async (distribuidoraFoco?: string) => {
    await handleExecutarSimulacao(true, distribuidoraFoco);
  };

  // Excluir item de um carrinho dentro da Modal Unificada "Ver Carrinhos"
  const handleExcluirItemDoCarrinhoModal = (distribuidoraNome: string, itemExcluir: any) => {
    setCarrinhosOtimizados(prev => {
      const atualizados = prev.map(car => {
        if (String(car.distribuidora).toUpperCase() !== String(distribuidoraNome).toUpperCase()) return car;
        const novosItens = (car.itens || []).filter((it: any) => {
          if (itemExcluir.produto_id && it.produto_id) return it.produto_id !== itemExcluir.produto_id;
          if (itemExcluir.ean && it.ean) return String(it.ean) !== String(itemExcluir.ean);
          return it.descricao !== itemExcluir.descricao;
        });
        const novoTotal = Number(novosItens.reduce((acc: number, i: any) => acc + (Number(i.subtotal) || 0), 0).toFixed(2));
        const min = Number(car.pedidoMinimo) || 300;
        const atingiu = novoTotal >= min;
        const falta = atingiu ? 0 : Number((min - novoTotal).toFixed(2));
        return {
          ...car,
          itens: novosItens,
          total: novoTotal,
          atingiuMinimo: atingiu,
          faltaParaMinimo: falta
        };
      }).filter(car => (car.itens || []).length > 0);

      const novoSelecionado = atualizados[Math.min(abaEmpresaModalIndex, Math.max(0, atualizados.length - 1))] || null;
      setCarrinhoModalSelecionado(novoSelecionado);
      return atualizados;
    });

    if (itemExcluir.produto_id) {
      setItensSelecionados(prev => ({ ...prev, [itemExcluir.produto_id]: false }));
    }
    addToast(`"${itemExcluir.descricao}" removido do carrinho da ${distribuidoraNome}.`, 'info');
  };

  // Passar item para o 2º colocado diretamente dentro da Modal Unificada "Ver Carrinhos"
  const handlePassarItemParaSegundoColocadoModal = (distribuidoraOrigem: string, itemMover: any) => {
    const itemTabela = faltasRaw.find(
      f => (itemMover.produto_id && f.produto_id === itemMover.produto_id) || (itemMover.ean && f.ean === itemMover.ean)
    );
    const segDist = (itemMover.segundoFornecedor || itemMover.segundoColocado || itemTabela?.fornecedor_2 || '').trim().toUpperCase();
    const segPreco = Number(itemMover.segundoPreco || itemMover.precoSegundoColocado || itemTabela?.preco_2 || 0);

    if (!segDist || segDist === '—' || segPreco <= 0) {
      addToast(`Não há 2º colocado com preço cotado disponível para "${itemMover.descricao}".`, 'warning');
      return;
    }

    const qtd = Number(itemMover.quantidade) || 1;
    const novoSubtotal = Number((qtd * segPreco).toFixed(2));
    const itemAtualizado = {
      ...itemMover,
      precoUnitario: segPreco,
      subtotal: novoSubtotal,
      repassado: true,
      repassadoDe: distribuidoraOrigem,
      motivoRepasse: `Passado manualmente para o 2º colocado (${segDist})`
    };

    setCarrinhosOtimizados(prev => {
      let destinoExiste = false;
      const lista = prev.map(car => {
        const nomeUpper = String(car.distribuidora).toUpperCase();
        if (nomeUpper === String(distribuidoraOrigem).toUpperCase()) {
          const novosItens = (car.itens || []).filter((it: any) => {
            if (itemMover.produto_id && it.produto_id) return it.produto_id !== itemMover.produto_id;
            if (itemMover.ean && it.ean) return String(it.ean) !== String(itemMover.ean);
            return it.descricao !== itemMover.descricao;
          });
          const novoTotal = Number(novosItens.reduce((acc: number, i: any) => acc + (Number(i.subtotal) || 0), 0).toFixed(2));
          const min = Number(car.pedidoMinimo) || 300;
          return {
            ...car,
            itens: novosItens,
            total: novoTotal,
            atingiuMinimo: novoTotal >= min,
            faltaParaMinimo: novoTotal >= min ? 0 : Number((min - novoTotal).toFixed(2))
          };
        }
        if (nomeUpper === segDist) {
          destinoExiste = true;
          const novosItens = [...(car.itens || []), itemAtualizado];
          const novoTotal = Number(novosItens.reduce((acc: number, i: any) => acc + (Number(i.subtotal) || 0), 0).toFixed(2));
          const min = Number(car.pedidoMinimo) || 300;
          return {
            ...car,
            itens: novosItens,
            total: novoTotal,
            atingiuMinimo: novoTotal >= min,
            faltaParaMinimo: novoTotal >= min ? 0 : Number((min - novoTotal).toFixed(2))
          };
        }
        return car;
      }).filter(car => (car.itens || []).length > 0);

      if (!destinoExiste) {
        const portalCad = portais.find(p => p.nome.toUpperCase() === segDist);
        const min = Number(portalCad?.pedido_minimo) || 300;
        lista.push({
          distribuidora: segDist,
          uf: portalCad?.uf_origem || 'MG',
          isMg: true,
          pedidoMinimo: min,
          prazoDias: Number(portalCad?.prazo_dias_padrao) || 28,
          boletoEleito: `${Number(portalCad?.prazo_dias_padrao) || 28} DDL`,
          total: novoSubtotal,
          atingiuMinimo: novoSubtotal >= min,
          faltaParaMinimo: novoSubtotal >= min ? 0 : Number((min - novoSubtotal).toFixed(2)),
          itens: [itemAtualizado]
        });
      }

      const novoSel = lista[Math.min(abaEmpresaModalIndex, Math.max(0, lista.length - 1))] || null;
      setCarrinhoModalSelecionado(novoSel);
      return lista;
    });

    // Atualiza também na tabela principal
    setFaltasRaw(prev => prev.map(f => {
      const bate = (itemMover.produto_id && f.produto_id === itemMover.produto_id) || (itemMover.ean && f.ean === itemMover.ean);
      if (!bate) return f;
      return {
        ...f,
        fornecedor_1: segDist,
        preco_1: segPreco,
        subtotal_7d: novoSubtotal,
        repassado_de: distribuidoraOrigem
      };
    }));

    addToast(`🔄 "${itemMover.descricao}" passado da ${distribuidoraOrigem} para ${segDist} (R$ ${segPreco.toFixed(2)})!`, 'success');
  };

  // Montar o carrinho de uma distribuidora específica diretamente pela Modal Unificada "Ver Carrinhos"
  const handleMontarCarrinhoDaAbaModal = async (carrinho: any) => {
    if (!carrinho || !Array.isArray(carrinho.itens) || carrinho.itens.length === 0) {
      addToast('Carrinho vazio para montagem.', 'warning');
      return;
    }
    const dist = String(carrinho.distribuidora || '').toUpperCase();
    const payloadItens = carrinho.itens.map((it: any) => ({
      ean: it.ean,
      descricao: it.descricao,
      quantidade: Number(it.quantidade) || 1,
      preco_1: Number(it.precoUnitario) || 0,
      fornecedor_1: dist,
      fornecedor_2: it.segundoFornecedor || it.segundoColocado || null,
      preco_2: Number(it.segundoPreco || it.precoSegundoColocado) || 0,
      preco_ult_compra: Number(it.precoUnitario) || 0
    }));

    let endpoint = '';
    if (dist.includes('PROFARMA')) endpoint = '/api/belaped/montar-carrinho-profarma';
    else if (dist.includes('DPC')) endpoint = '/api/belaped/montar-carrinho-dpc';
    else if (dist.includes('SOTON')) endpoint = '/api/belaped/montar-carrinho-soton';
    else if (dist.includes('DISTRIMED')) endpoint = '/api/belaped/importar-carrinho-distrimed';
    else if (dist.includes('DIVIMED')) endpoint = '/api/belaped/montar-carrinho-divimed';
    else if (dist.includes('MARTINS')) endpoint = '/api/belaped/montar-carrinho-martins';
    else if (dist.includes('ORIENTE')) endpoint = '/api/belaped/montar-carrinho-oriente';
    else if (dist.includes('PANPHARMA') || dist.includes('PANFARMA')) endpoint = '/api/belaped/montar-carrinho-panpharma';
    else if (dist.includes('MG MEDICAMENTOS') || dist.includes('MGMEDICAMENTOS') || dist.startsWith('MG')) endpoint = '/api/belaped/montar-carrinho-mgmedicamentos';
    else if (dist.includes('STOCKFARMA') || dist.includes('STOCK')) endpoint = '/api/belaped/montar-carrinho-stockfarma';
    else if (dist.includes('ORGAFARMA') || dist.includes('ORGA')) endpoint = '/api/belaped/montar-carrinho-orgafarma';
    else if (dist.includes('FARMIX')) endpoint = '/api/belaped/montar-carrinho-farmix';
    else if (dist.includes('HYMPAR')) endpoint = '/api/belaped/montar-carrinho-hympar';

    if (!endpoint) {
      addToast(`Portal ${dist} não possui robô de montagem individual mapeado.`, 'warning');
      return;
    }

    try {
      addToast(`🤖 Iniciando robô para montar o carrinho da ${dist} (${payloadItens.length} itens)...`, 'info');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: payloadItens })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(data.message || `Robô montando carrinho na ${dist}! Acompanhe pelo monitor do robô.`, 'success');
      } else {
        addToast(data.message || data.error || `Erro ao montar carrinho na ${dist}`, 'error');
      }
    } catch (e: any) {
      addToast(`Erro ao acionar robô da ${dist}: ${e.message}`, 'error');
    }
  };

  // Confirmar compra e lançar o Pedido + Boletos diretamente na guia "Pedidos" do Belinha
  const handleConfirmarELancarPedidoModal = async (carrinho: any, prazoEscolhido?: string) => {
    if (!carrinho) return;
    const prazoFinal = prazoEscolhido || prazoSelecionadoModal || carrinho.boletoEleito || `${carrinho.prazoDias || 28} DDL`;
    try {
      setLancandoPedidoBelinha(true);
      const res = await fetch('/api/belaped/lancar-pedido-belinha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distribuidora: carrinho.distribuidora,
          valorTotal: Number(carrinho.total) || 0,
          itens: carrinho.itens || [],
          parcelasCustomizadas: carrinho.parcelasCalculadas || null,
          carrinho,
          prazoEscolhido: prazoFinal,
          numeroPedido: `PED-${Date.now().toString().slice(-6)}`
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const qtdBol = data.lancamento?.installments?.length || data.lancamento?.boletosCriados?.length || 1;
        addToast(
          `✅ Compra confirmada e lançada na guia "Pedidos" do Belinha! (${carrinho.distribuidora} • R$ ${Number(carrinho.total || 0).toFixed(2)} • ${qtdBol} boleto(s) agendado(s))`,
          'success'
        );
        carregarDados();
      } else {
        addToast(data.error || 'Erro ao lançar pedido na guia Pedidos do Belinha', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao lançar pedido: ' + err.message, 'error');
    } finally {
      setLancandoPedidoBelinha(false);
    }
  };

  // Abrir Navegador no Portal da Distribuidora (Finalizar Compra)
  const handleAbrirNavegadorCarrinho = (carrinho: any) => {
    const portal = portais.find(p => p.nome.toUpperCase() === carrinho.distribuidora.toUpperCase());
    const url = portal?.url_portal || 'https://pedido.profarma.com.br/?callbackUrl=%2Fnovo-pedido';
    window.open(url, '_blank');
    addToast(`Redirecionando para ${carrinho.distribuidora}. O carrinho foi montado com ${carrinho.itens.length} itens (Total R$ ${carrinho.total.toFixed(2)})!`, 'success');
  };

  // Calcula as datas de vencimento reais dos boletos a partir de uma string de prazo (ex: "42 DDL" -> "27/11/2026", "28/35/42 DDL" -> "13/11, 20/11 e 27/11")
  const formatarPrazoComDataVencimento = (prazoStr: string): string => {
    if (!prazoStr) return '';
    const str = String(prazoStr).trim();
    const hoje = new Date();

    if (str.toLowerCase().includes('à vista') || str.toLowerCase().includes('a vista')) {
      const d = new Date(hoje);
      const mNum = str.match(/\d+/);
      if (mNum) {
        d.setDate(d.getDate() + parseInt(mNum[0], 10));
      }
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = d.getFullYear();
      return `${dia}/${mes}/${ano}`;
    }

    const numeros = str.match(/\d+/g);
    if (!numeros || numeros.length === 0) return '';

    const dias = numeros.map(n => parseInt(n, 10)).filter(n => n > 0 && n <= 365);
    if (dias.length === 0) return '';

    if (dias.length === 1) {
      const d = new Date(hoje);
      d.setDate(d.getDate() + dias[0]);
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = d.getFullYear();
      return `${dia}/${mes}/${ano}`;
    }

    // Múltiplas parcelas (ex: 28/35/42 DDL)
    const datasFormatadas = dias.map(diasPrazo => {
      const d = new Date(hoje);
      d.setDate(d.getDate() + diasPrazo);
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      return `${dia}/${mes}`;
    });

    return datasFormatadas.join(' • ');
  };

  // ─── COMPRA DIRETA & ORQUESTRADOR DE CARRINHOS ──────────────────────────────
  // Dispara a montagem sequencial de todos os carrinhos otimizados
  const handleMontarTodosCarrinhos = async () => {
    try {
      if (carrinhosOtimizados.length === 0) {
        addToast('Nenhum carrinho otimizado disponível. Execute a otimização primeiro.', 'warning');
        return;
      }

      setMontandoTodosCarrinhos(true);
      const res = await fetch('/api/belaped/montar-todos-carrinhos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrinhos: carrinhosOtimizados })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        addToast(data.error || data.message || 'Erro ao iniciar montagem de carrinhos.', 'error');
        setMontandoTodosCarrinhos(false);
        return;
      }

      addToast(data.message || 'Montagem iniciada com sucesso!', 'info');
      setStatusTodosCarrinhos(data.status);

      // Polling a cada 1.5s para acompanhar o avanço dos robôs
      const timer = setInterval(async () => {
        try {
          const resPoll = await fetch('/api/belaped/status-todos-carrinhos');
          const dataPoll = await resPoll.json();
          if (dataPoll.success && dataPoll.status) {
            setStatusTodosCarrinhos(dataPoll.status);
            if (!dataPoll.status.emAndamento) {
              clearInterval(timer);
              setMontandoTodosCarrinhos(false);
              addToast(`Montagem concluída! ${dataPoll.status.itensSucessoTotal} itens adicionados com sucesso nos carrinhos.`, 'success');
            }
          }
        } catch (e) {
          // Erro silencioso no polling
        }
      }, 1500);
    } catch (err: any) {
      addToast('Falha ao iniciar montagem de carrinhos: ' + err.message, 'error');
      setMontandoTodosCarrinhos(false);
    }
  };

  // Abrir Modal de Carrinho da Distribuidora (Belinha)
  const handleAbrirModalCarrinho = (carrinho: any) => {
    const idx = carrinhosOtimizados.findIndex(
      c => String(c.distribuidora).toUpperCase() === String(carrinho.distribuidora).toUpperCase()
    );
    if (idx >= 0) setAbaEmpresaModalIndex(idx);
    setCarrinhoModalSelecionado(carrinho);
    // Sugere o melhor prazo eleito
    setPrazoSelecionadoModal(carrinho.boletoEleito || (carrinho.prazoDias + ' DDL'));
    setCarrinhoModalAberto(true);
  };

  // Executar a Compra Direta em uma Distribuidora Específica (e lança automaticamente em Pedidos do Belinha)
  const handleComprarCarrinhoDireto = async (carrinho: any, prazo?: string) => {
    const prazoFinal = prazo || prazoSelecionadoModal || carrinho.boletoEleito || (carrinho.prazoDias + ' DDL');
    try {
      setComprandoDireto(true);
      setDistribuidoraComprando(carrinho.distribuidora);
      addToast(`Disparando robô para compra na ${carrinho.distribuidora} (Prazo: ${prazoFinal})...`, 'info');

      const res = await fetch('/api/belaped/comprar-carrinho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distribuidora: carrinho.distribuidora,
          carrinho,
          prazoEscolhido: prazoFinal
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResultadoUltimaCompra(data.resultado);
        addToast(`🎉 Compra realizada na ${carrinho.distribuidora} e lançada na guia Pedidos do Belinha! Pedido: ${data.resultado?.numeroPedido || 'Confirmado'}`, 'success');
        carregarDados();
        return data.resultado;
      } else {
        const msg = data.resultado?.mensagem || data.error || 'Erro ao finalizar compra.';
        addToast(`Aviso na ${carrinho.distribuidora}: ${msg}`, 'warning');
        return data.resultado;
      }
    } catch (err: any) {
      addToast(`Erro crítico ao comprar na ${carrinho.distribuidora}: ${err.message}`, 'error');
      return null;
    } finally {
      setComprandoDireto(false);
      setDistribuidoraComprando(null);
    }
  };

  // Iniciar Wizard "Comprar Todos (Passo a Passo)"
  const handleIniciarWizardComprarTodos = () => {
    if (carrinhosOtimizados.length === 0) {
      addToast('Nenhum carrinho otimizado para comprar.', 'warning');
      return;
    }
    const prazosIniciais: Record<string, string> = {};
    carrinhosOtimizados.forEach(c => {
      prazosIniciais[c.distribuidora] = c.boletoEleito || (c.prazoDias + ' DDL');
    });
    setWizardPrazosPorDist(prazosIniciais);
    setWizardEtapaAtual(0);
    setWizardHistoricoResultados([]);
    setWizardComprarTodosAberto(true);
  };

  // Iniciar Cotação ao Vivo com o Robô Puppeteer (13 Portais)
  const handleIniciarCotacaoAoVivo = async (
    fornecedor: 'PROFARMA' | 'DPC' | 'SOTON' | 'DISTRIMED' | 'DIVIMED' | 'MARTINS' | 'ORIENTE' | 'PANPHARMA' | 'MG MEDICAMENTOS' | 'STOCKFARMA' | 'ORGAFARMA' | 'FARMIX' | 'HYMPARHUB' | 'TODOS' = 'TODOS',
    tamanhoLote: number = 40,
    prioridadeFiltro?: 'P1' | 'P2' | 'P3' | 'P4' | 'TODAS_PRIORITARIAS' | 'TODOS',
    eansEspecificos?: string[]
  ) => {
    try {
      setCotandoAoVivo(true);

      const limiteReal = Math.max(10, Math.min(200, tamanhoLote || 40));

      let eansParaCotar: string[] = [];
      if (Array.isArray(eansEspecificos) && eansEspecificos.length > 0) {
        eansParaCotar = eansEspecificos;
      } else {
        // Ordenação estrita: 1º itens ainda não cotados, 2º Matriz de Gravidade Operacional (P1 Ruptura -> P2 Risco -> P3 Orçamento -> P4 Regular)
        const pesoPrio: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
        const itensOrdenadosPorPrio = [...faltasFiltradas]
          .filter(s => s.ean && s.ean.length >= 7)
          .filter(s => {
            if (prioridadeFiltro && prioridadeFiltro !== 'TODAS_PRIORITARIAS' && prioridadeFiltro !== 'TODOS') {
              return s.prioridade === prioridadeFiltro;
            }
            return true;
          })
          .sort((a, b) => {
            const aNaoCotado = (!a.fornecedor_1 || a.fornecedor_1 === 'Não Cotado') ? 0 : 1;
            const bNaoCotado = (!b.fornecedor_1 || b.fornecedor_1 === 'Não Cotado') ? 0 : 1;
            if (aNaoCotado !== bNaoCotado) return aNaoCotado - bNaoCotado;
            const pa = pesoPrio[a.prioridade || 'P4'] || 4;
            const pb = pesoPrio[b.prioridade || 'P4'] || 4;
            return pa - pb;
          });

        // Prioriza os itens pendentes de cotação dentro da ordem de gravidade
        const naoCotados = itensOrdenadosPorPrio
          .filter(s => !s.fornecedor_1 || s.fornecedor_1 === 'Não Cotado')
          .map(s => s.ean);

        const demaisEans = itensOrdenadosPorPrio
          .map(s => s.ean)
          .filter(e => !naoCotados.includes(e));

        eansParaCotar = [...naoCotados, ...demaisEans].slice(0, limiteReal);
      }

      const rotuloPrioridade = prioridadeFiltro && prioridadeFiltro !== 'TODAS_PRIORITARIAS' && prioridadeFiltro !== 'TODOS' ? `[${prioridadeFiltro}] ` : '';
      const nomeExibicao = fornecedor === 'TODOS' ? '9 Portais (Profarma, DPC, Soton, Distrimed, Divimed, Martins, Oriente, Panpharma e MG)' : fornecedor;

      // Resposta visual IMEDIATA (0ms): Mostra o banner e status instantaneamente
      setStatusCotacao({
        emAndamento: true,
        fornecedor: nomeExibicao,
        total: eansParaCotar.length || limiteReal,
        atual: 0,
        encontrados: 0,
        ultimoItem: `Conectando aos portais para cotar ${rotuloPrioridade}produtos prioritários...`
      });

      addToast(`Robô de cotação iniciado para ${nomeExibicao} (${rotuloPrioridade}${eansParaCotar.length || limiteReal} itens)!`, 'info');

      const res = await fetch('/api/belaped/cotar-ao-vivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedor,
          limite: limiteReal,
          eans: eansParaCotar.length > 0 ? eansParaCotar : undefined,
          prioridade: (prioridadeFiltro && prioridadeFiltro !== 'TODAS_PRIORITARIAS' && prioridadeFiltro !== 'TODOS') ? prioridadeFiltro : undefined,
          por_essencia: cotarEssenciaAtivo
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
      let ultimoJaCotados = 0;
      let ultimaAtualizacao = 0;

      // Monitora o progresso em segundo plano a cada 2.5s e atualiza a tabela ao vivo de forma leve
      const verificarProgresso = async () => {
        try {
          const stRes = await fetch('/api/belaped/status-cotacao');
          const stData = await stRes.json();
          if (stData.success && stData.status) {
            setStatusCotacao(stData.status);
            const jaCotados = Number(stData.status.fila?.jaCotados || 0);
            const encontrados = Number(stData.status.encontrados || 0);
            const agora = Date.now();

            const mudou = jaCotados !== ultimoJaCotados || encontrados !== ultimoEncontrados;
            if (mudou && (agora - ultimaAtualizacao > 4000)) {
              ultimoJaCotados = jaCotados;
              ultimoEncontrados = encontrados;
              ultimaAtualizacao = agora;
              carregarDados(true);
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

  // Reiniciar a Cotação (Interrompe qualquer robô travado, limpa o status e inicia do zero)
  const handleReiniciarCotacao = async () => {
    try {
      setReiniciandoCotacao(true);
      addToast('Reiniciando a cotação nos 9 portais...', 'info');

      // 1. Chama a rota de reinicialização no backend para destravar qualquer processo e resetar flags
      const res = await fetch('/api/belaped/reiniciar-cotacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedor: 'TODOS',
          limite: 40,
          prioridade: 'TODAS_PRIORITARIAS',
          dispararImediato: false,
          limparCotacoes: true
        })
      });
      const data = await res.json();
      if (data?.registrosApagados !== undefined) {
        addToast(`🧹 ${data.registrosApagados} cotações anteriores apagadas. Cotando do zero nos 9 portais!`, 'info');
      }
      if (data?.status) {
        setStatusCotacao(data.status);
      }
      carregarDados(true);

      // 2. Dispara imediatamente um novo ciclo limpo através do controlador principal
      await handleIniciarCotacaoAoVivo('TODOS', 40, 'TODAS_PRIORITARIAS');
    } catch (err: any) {
      addToast('Erro ao reiniciar cotação: ' + (err?.message || err), 'error');
      setCotandoAoVivo(false);
    } finally {
      setTimeout(() => setReiniciandoCotacao(false), 1500);
    }
  };

  // Montar Carrinho Roboticamente na Soton Farma (Produto a Produto)
  const handleMontarCarrinhoSoton = async () => {
    try {
      setMontandoCarrinhoSoton(true);

      const temSelecaoManual = Object.values(itensSelecionados).some(Boolean);
      const base = temSelecaoManual ? faltasFiltradas.filter(f => itensSelecionados[f.produto_id]) : faltasFiltradas;
      const itensSoton = base
        .filter(f => !f.nao_carrinho && (f.fornecedor_1 || '').toUpperCase().includes('SOTON') && f.ean)
        .map(f => ({
          ean: f.ean,
          quantidade: f.qtd_sugerida_7d || 1,
          descricao: f.descricao,
          preco_1: f.preco_1,
          fornecedor_1: f.fornecedor_1,
          preco_2: f.preco_2,
          fornecedor_2: f.fornecedor_2,
          preco_ult_compra: Number(f.preco_ult_compra ?? f.custo_unitario ?? 0)
        }));

      if (itensSoton.length === 0) {
        addToast('Nenhum item liberado com a Soton como vencedora encontrado na lista atual do Belinha.', 'warning');
        setMontandoCarrinhoSoton(false);
        return;
      }

      const res = await fetch('/api/belaped/montar-carrinho-soton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensSoton })
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
              if (stData.status.relatorio) {
                setUltimoRelatorioAuditoria(stData.status.relatorio);
                setModalRelatorioAberto(true);
              }
              carregarDados();
              addToast(`Montagem Soton concluída! ${stData.status.sucessos} itens adicionados com sucesso!`, 'success');
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

  // Download silencioso de arquivos sem abrir abas em branco no navegador
  const baixarArquivoSemAbrirAba = (url: string, nomeArquivo: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); } catch (e) {}
    }, 200);
  };

  // Baixar Planilha Pronta no Modelo do Pedido Profarma (Codigo/EAN e Quantidade)
  const handleExportarPlanilhaProfarma = () => {
    baixarArquivoSemAbrirAba('/api/belaped/exportar-planilha-profarma', 'pedido_profarma.csv');
    addToast('Download da planilha de pedido Profarma gerado com sucesso!', 'info');
  };

  // Baixar Planilha Pronta no Modelo do Pedido DPC (codigo ou ean e quantidade)
  const handleExportarPlanilhaDpc = () => {
    baixarArquivoSemAbrirAba('/api/belaped/exportar-planilha-dpc', 'pedido_dpc.csv');
    addToast('Download da planilha de pedido DPC gerado com sucesso!', 'info');
  };

  // Baixar Planilha no Modelo da Distrimed (EAN;Quantidade)
  const handleExportarPlanilhaDistrimed = () => {
    baixarArquivoSemAbrirAba('/api/belaped/exportar-planilha-distrimed', 'pedido_distrimed.csv');
    addToast('Download da planilha de pedido Distrimed gerado com sucesso!', 'info');
  };

  // Montar Carrinho Roboticamente na DPC Distribuidora (Produto a Produto)
  const handleMontarCarrinhoDpc = async () => {
    try {
      setMontandoCarrinhoDpc(true);

      const temSelecaoManual = Object.values(itensSelecionados).some(Boolean);
      const base = temSelecaoManual ? faltasFiltradas.filter(f => itensSelecionados[f.produto_id]) : faltasFiltradas;
      const itensDpc = base
        .filter(f => !f.nao_carrinho && (f.fornecedor_1 || '').toUpperCase().includes('DPC') && f.ean)
        .map(f => ({
          ean: f.ean,
          quantidade: f.qtd_sugerida_7d || 1,
          descricao: f.descricao,
          preco_1: f.preco_1,
          fornecedor_1: f.fornecedor_1,
          preco_2: f.preco_2,
          fornecedor_2: f.fornecedor_2,
          preco_ult_compra: Number(f.preco_ult_compra ?? f.custo_unitario ?? 0)
        }));

      if (itensDpc.length === 0) {
        addToast('Nenhum item liberado com a DPC como vencedora encontrado na lista atual do Belinha.', 'warning');
        setMontandoCarrinhoDpc(false);
        return;
      }

      const res = await fetch('/api/belaped/montar-carrinho-dpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensDpc })
      });

      const data = await res.json();
      if (!data.success) {
        addToast(data.message || 'Erro ao iniciar robô da DPC', 'error');
        setMontandoCarrinhoDpc(false);
        return;
      }

      addToast(data.message || 'Robô conectando na DPC para adicionar os produtos no carrinho!', 'success');

      // Polling do status da montagem de carrinho DPC
      const timerDpc = setInterval(async () => {
        try {
          const stRes = await fetch('/api/belaped/status-carrinho-dpc');
          const stData = await stRes.json();
          if (stData.success && stData.status) {
            setStatusCarrinhoDpc(stData.status);
            if (!stData.status.emAndamento) {
              clearInterval(timerDpc);
              setMontandoCarrinhoDpc(false);
              if (stData.status.relatorio) {
                setUltimoRelatorioAuditoria(stData.status.relatorio);
                setModalRelatorioAberto(true);
              }
              carregarDados();
              addToast(`Montagem DPC concluída! ${stData.status.sucessos} itens adicionados com sucesso!`, 'success');
            }
          }
        } catch (e) {
          clearInterval(timerDpc);
          setMontandoCarrinhoDpc(false);
        }
      }, 2500);

    } catch (err: any) {
      addToast('Erro ao acionar robô DPC: ' + err.message, 'error');
      setMontandoCarrinhoDpc(false);
    }
  };

  // Montar Carrinho Roboticamente na Profarma (Produto a Produto)
  const handleMontarCarrinhoProfarma = async () => {
    try {
      setMontandoCarrinhoProfarma(true);

      const temSelecaoManual = Object.values(itensSelecionados).some(Boolean);
      const base = temSelecaoManual ? faltasFiltradas.filter(f => itensSelecionados[f.produto_id]) : faltasFiltradas;
      const itensProfarma = base
        .filter(f => !f.nao_carrinho && (f.fornecedor_1 || '').toUpperCase().includes('PROFARMA') && f.ean)
        .map(f => ({
          ean: f.ean,
          quantidade: f.qtd_sugerida_7d || 1,
          descricao: f.descricao,
          preco_1: f.preco_1,
          fornecedor_1: f.fornecedor_1,
          preco_2: f.preco_2,
          fornecedor_2: f.fornecedor_2,
          preco_ult_compra: Number(f.preco_ult_compra ?? f.custo_unitario ?? 0)
        }));

      if (itensProfarma.length === 0) {
        addToast('Nenhum item liberado com a Profarma como vencedora encontrado na lista atual do Belinha.', 'warning');
        setMontandoCarrinhoProfarma(false);
        return;
      }

      const res = await fetch('/api/belaped/montar-carrinho-profarma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensProfarma })
      });

      const data = await res.json();
      if (!data.success) {
        addToast(data.message || 'Erro ao iniciar robô da Profarma', 'error');
        setMontandoCarrinhoProfarma(false);
        return;
      }

      addToast(data.message || 'Robô conectando na Profarma para adicionar os produtos no carrinho!', 'success');

      // Polling do status da montagem de carrinho Profarma
      const timerProf = setInterval(async () => {
        try {
          const stRes = await fetch('/api/belaped/status-carrinho-profarma');
          const stData = await stRes.json();
          if (stData.success && stData.status) {
            setStatusCarrinhoProfarma(stData.status);
            if (!stData.status.emAndamento) {
              clearInterval(timerProf);
              setMontandoCarrinhoProfarma(false);
              if (stData.status.relatorio) {
                setUltimoRelatorioAuditoria(stData.status.relatorio);
                setModalRelatorioAberto(true);
              }
              carregarDados();
              addToast(`Montagem Profarma concluída! ${stData.status.sucessos} itens adicionados com sucesso!`, 'success');
            }
          }
        } catch (e) {
          clearInterval(timerProf);
          setMontandoCarrinhoProfarma(false);
        }
      }, 2500);

    } catch (err: any) {
      addToast('Erro ao acionar robô Profarma: ' + err.message, 'error');
      setMontandoCarrinhoProfarma(false);
    }
  };

  // Montar Carrinho Roboticamente no Martins Atacado (Produto a Produto)
  const handleMontarCarrinhoMartins = async () => {
    try {
      setMontandoCarrinhoMartins(true);

      const temSelecaoManual = Object.values(itensSelecionados).some(Boolean);
      const base = temSelecaoManual ? faltasFiltradas.filter(f => itensSelecionados[f.produto_id]) : faltasFiltradas;
      const itensMartins = base
        .filter(f => !f.nao_carrinho && (f.fornecedor_1 || '').toUpperCase().includes('MARTINS') && f.ean)
        .map(f => ({
          ean: f.ean,
          quantidade: f.qtd_sugerida_7d || 1,
          descricao: f.descricao,
          preco_1: f.preco_1,
          fornecedor_1: f.fornecedor_1,
          preco_2: f.preco_2,
          fornecedor_2: f.fornecedor_2,
          preco_ult_compra: Number(f.preco_ult_compra ?? f.custo_unitario ?? 0)
        }));

      if (itensMartins.length === 0) {
        addToast('Nenhum item liberado com Martins como vencedor encontrado na lista atual do Belinha.', 'warning');
        setMontandoCarrinhoMartins(false);
        return;
      }

      const res = await fetch('/api/belaped/montar-carrinho-martins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensMartins })
      });

      const data = await res.json();
      if (!data.success) {
        addToast(data.message || 'Erro ao iniciar robô do Martins', 'error');
        setMontandoCarrinhoMartins(false);
        return;
      }

      addToast(data.message || 'Robô conectando no Martins para adicionar os produtos no carrinho!', 'success');

      // Polling do status da montagem de carrinho Martins
      const timerMartins = setInterval(async () => {
        try {
          const stRes = await fetch('/api/belaped/status-carrinho-martins');
          const stData = await stRes.json();
          if (stData.success && stData.status) {
            setStatusCarrinhoMartins(stData.status);
            if (!stData.status.emAndamento) {
              clearInterval(timerMartins);
              setMontandoCarrinhoMartins(false);
              if (stData.status.relatorio) {
                setUltimoRelatorioAuditoria(stData.status.relatorio);
                setModalRelatorioAberto(true);
              }
              carregarDados();
              addToast(`Montagem Martins concluída! ${stData.status.sucessos} itens adicionados com sucesso!`, 'success');
            }
          }
        } catch (e) {
          clearInterval(timerMartins);
          setMontandoCarrinhoMartins(false);
        }
      }, 2500);

    } catch (err: any) {
      addToast('Erro ao acionar robô Martins: ' + err.message, 'error');
      setMontandoCarrinhoMartins(false);
    }
  };

  // Montagem Robótica de Carrinho na Oriente Farma Produto por Produto
  const handleMontarCarrinhoOriente = async () => {
    try {
      setMontandoCarrinhoOriente(true);

      const temSelecaoManual = Object.values(itensSelecionados).some(Boolean);
      const base = temSelecaoManual ? faltasFiltradas.filter(f => itensSelecionados[f.produto_id]) : faltasFiltradas;
      const itensOriente = base
        .filter(f => !f.nao_carrinho && (f.fornecedor_1 || '').toUpperCase().includes('ORIENTE') && f.ean)
        .map(f => ({
          ean: f.ean,
          quantidade: f.qtd_sugerida_7d || 1,
          descricao: f.descricao,
          preco_1: f.preco_1 || 0,
          preco_ult_compra: f.preco_ult_compra || f.custo_unitario || 0,
          fornecedor_2: f.fornecedor_2,
          preco_2: f.preco_2
        }));

      if (itensOriente.length === 0) {
        addToast('Nenhum item com melhor preço na Oriente Farma para adicionar ao carrinho (ou itens bloqueados).', 'warning');
        setMontandoCarrinhoOriente(false);
        return;
      }

      const res = await fetch('/api/belaped/montar-carrinho-oriente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensOriente })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        addToast(data.message || data.error || 'Erro ao iniciar robô Oriente Farma', 'error');
        setMontandoCarrinhoOriente(false);
        return;
      }

      addToast(data.message || 'Robô conectando na Oriente Farma para adicionar os produtos no carrinho!', 'success');

      // Polling de status
      const timerOriente = setInterval(async () => {
        try {
          const stRes = await fetch('/api/belaped/status-carrinho-oriente');
          const stData = await stRes.json();
          if (stData.success && stData.status) {
            setStatusCarrinhoOriente(stData.status);
            if (!stData.status.emAndamento) {
              clearInterval(timerOriente);
              setMontandoCarrinhoOriente(false);
              if (stData.status.relatorio) {
                setUltimoRelatorioAuditoria(stData.status.relatorio);
                setModalRelatorioAberto(true);
              }
              carregarDados();
              addToast(`Montagem Oriente Farma concluída! ${stData.status.sucessos} itens adicionados com sucesso!`, 'success');
            }
          }
        } catch (e) {
          clearInterval(timerOriente);
          setMontandoCarrinhoOriente(false);
        }
      }, 2500);

    } catch (err: any) {
      addToast('Erro ao acionar robô Oriente Farma: ' + err.message, 'error');
      setMontandoCarrinhoOriente(false);
    }
  };

  // Importar Carrinho Automaticamente na Modal da Distrimed via Robô Puppeteer
  const handleImportarCarrinhoDistrimed = async () => {
    try {
      setImportandoDistrimed(true);

      const temSelecaoManual = Object.values(itensSelecionados).some(Boolean);
      const base = temSelecaoManual ? faltasFiltradas.filter(f => itensSelecionados[f.produto_id]) : faltasFiltradas;
      const itensDistrimed = base
        .filter(f => !f.nao_carrinho && (f.fornecedor_1 || '').toUpperCase().includes('DISTRIMED') && f.ean)
        .map(f => ({
          ean: f.ean,
          quantidade: f.qtd_sugerida_7d || 1,
          descricao: f.descricao,
          preco_1: f.preco_1,
          fornecedor_1: f.fornecedor_1,
          preco_2: f.preco_2,
          fornecedor_2: f.fornecedor_2,
          preco_ult_compra: Number(f.preco_ult_compra ?? f.custo_unitario ?? 0)
        }));

      if (itensDistrimed.length === 0) {
        addToast('Nenhum item liberado com a Distrimed como vencedora encontrado na lista atual do Belinha.', 'warning');
        setImportandoDistrimed(false);
        return;
      }

      const res = await fetch('/api/belaped/importar-carrinho-distrimed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensDistrimed })
      });
      const data = await res.json();
      if (!data.success) {
        addToast(data.message || 'Erro ao iniciar robô Distrimed', 'error');
        setImportandoDistrimed(false);
        return;
      }

      addToast(`Robô Distrimed iniciado! Importando ${itensDistrimed.length} itens via modal...`, 'success');

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
              if (stData.status.relatorio) {
                setUltimoRelatorioAuditoria(stData.status.relatorio);
                setModalRelatorioAberto(true);
              }
              carregarDados();
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

  // Montar Carrinho Roboticamente na Divimed (Produto a Produto pelo Nome)
  const handleMontarCarrinhoDivimed = async () => {
    try {
      setMontandoCarrinhoDivimed(true);

      const temSelecaoManual = Object.values(itensSelecionados).some(Boolean);
      const base = temSelecaoManual ? faltasFiltradas.filter(f => itensSelecionados[f.produto_id]) : faltasFiltradas;
      const itensDivimed = base
        .filter(f => !f.nao_carrinho && (f.fornecedor_1 || '').toUpperCase().includes('DIVIMED') && f.ean)
        .map(f => ({
          ean: f.ean,
          descricao: f.descricao,
          quantidade: f.qtd_sugerida_7d || 1,
          preco_1: f.preco_1,
          fornecedor_1: f.fornecedor_1,
          preco_2: f.preco_2,
          fornecedor_2: f.fornecedor_2,
          preco_ult_compra: Number(f.preco_ult_compra ?? f.custo_unitario ?? 0)
        }));

      if (itensDivimed.length === 0) {
        addToast('Nenhum item liberado com a Divimed como vencedora encontrado na lista atual do Belinha.', 'warning');
        setMontandoCarrinhoDivimed(false);
        return;
      }

      addToast(`Iniciando robô para adicionar ${itensDivimed.length} itens no carrinho da Divimed...`, 'info');

      const res = await fetch('/api/belaped/montar-carrinho-divimed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensDivimed })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Erro ao iniciar robô da Divimed');
      }

      setStatusCarrinhoDivimed(data.status);

      const timerDiv = setInterval(async () => {
        try {
          const stRes = await fetch('/api/belaped/status-carrinho-divimed');
          const stData = await stRes.json();
          if (stData.success && stData.status) {
            setStatusCarrinhoDivimed(stData.status);
            if (!stData.status.emAndamento) {
              clearInterval(timerDiv);
              setMontandoCarrinhoDivimed(false);
              if (stData.status.relatorio) {
                setUltimoRelatorioAuditoria(stData.status.relatorio);
                setModalRelatorioAberto(true);
              }
              carregarDados();
              addToast(`Carrinho montado na Divimed! ${stData.status.sucessos} itens adicionados com sucesso!`, 'success');
            }
          }
        } catch (e) {
          clearInterval(timerDiv);
          setMontandoCarrinhoDivimed(false);
        }
      }, 2500);

    } catch (err: any) {
      addToast('Erro ao acionar robô Divimed: ' + err.message, 'error');
      setMontandoCarrinhoDivimed(false);
    }
  };

  // Renderizador do Card Individual de Produto (Visualização em Cards solicitada pelo usuário)
  const renderProdutoCard = (item: FaltaItem7d) => {
    const isSelected = Boolean(itensSelecionados[item.produto_id]);
    const isRuptura = item.saldo <= 0;
    const semEstoquePortais = item.fornecedor_1 === 'Sem Estoque (Portais)';
    const temCotacaoReal = Boolean(item.fornecedor_1 && item.fornecedor_1 !== 'Não Cotado' && !semEstoquePortais && item.preco_1 && item.preco_1 > 0);
    const fornecedor1 = temCotacaoReal ? item.fornecedor_1! : (semEstoquePortais ? 'Sem Estoque (Portais)' : 'Aguardando Robô');
    const preco1 = temCotacaoReal ? item.preco_1! : null;
    const fornecedor2 = (item.fornecedor_2 && item.fornecedor_2 !== '—') ? item.fornecedor_2 : null;
    const preco2 = (item.preco_2 && item.preco_2 > 0) ? item.preco_2 : null;
    const precoUltCompra = Number(item.preco_ult_compra ?? item.custo_unitario ?? 0);
    const diffUltCompra = (preco1 && precoUltCompra > 0) ? Number((((preco1 - precoUltCompra) / precoUltCompra) * 100).toFixed(1)) : 0;
    const diff2Colocado = (preco1 && preco2 && preco2 > preco1) ? Number((((preco2 - preco1) / preco1) * 100).toFixed(1)) : 0;
    const economizou = preco1 && precoUltCompra > 0 && preco1 < precoUltCompra;
    const diferencaReais = preco1 && precoUltCompra > 0 ? Number((precoUltCompra - preco1).toFixed(2)) : 0;
    const dataUltFormatada = item.data_ult_compra ? new Date(item.data_ult_compra).toLocaleDateString('pt-BR') : '';

    const isBloqueadoCarrinho = Boolean(item.nao_carrinho);
    const isNaoCotar = Boolean(item.nao_cotar);
    const isJaPedido = Boolean(item.is_ja_pedido || (item.ja_pedido_ate && String(item.ja_pedido_ate) >= new Date().toISOString().slice(0, 10)));

    return (
      <div
        key={item.produto_id}
        className={`flex flex-col justify-between rounded-2xl border transition-all duration-200 p-3 sm:p-4 shadow-lg relative ${
          isBloqueadoCarrinho
            ? 'bg-[#151016] border-amber-600/70 shadow-amber-950/20 ring-1 ring-amber-500/30'
            : isNaoCotar
            ? 'bg-[#180e14] border-rose-600/70 shadow-rose-950/20 ring-1 ring-rose-500/30'
            : isJaPedido
            ? 'bg-[#0a1322] border-blue-600/70 shadow-blue-950/20 ring-1 ring-blue-500/30'
            : isSelected
            ? 'bg-[#0a182c] border-cyan-500/80 shadow-cyan-950/40 ring-1 ring-cyan-500/50'
            : 'bg-[#0b1322] border-slate-800 hover:border-slate-700 hover:shadow-slate-900/40'
        }`}
      >
        {/* Topo do Card: Checkbox + Badges */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <input
                type="checkbox"
                checked={isSelected}
                disabled={isBloqueadoCarrinho}
                onChange={() => setItensSelecionados(prev => ({ ...prev, [item.produto_id]: !prev[item.produto_id] }))}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={isBloqueadoCarrinho ? 'Produto bloqueado para não entrar no carrinho' : 'Selecionar item'}
              />
              {item.is_desejado && (
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-400 shadow-sm whitespace-nowrap animate-pulse"
                  title="⭐ Produto Desejado adicionado manualmente para cotação e compra"
                >
                  ⭐ Desejado
                </span>
              )}
              {item.ranking_posicao && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[11px] font-black border ${
                    item.ranking_posicao <= 10
                      ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white border-amber-400 shadow-sm'
                      : 'bg-cyan-950 text-cyan-300 border-cyan-700'
                  }`}
                  title={`Rankeamento #${item.ranking_posicao} de Urgência (Alto Giro + Risco de Ruptura • Score: ${item.score_ranking || 0})`}
                >
                  {item.ranking_posicao <= 3 ? '🔥 ' : ''}#{item.ranking_posicao}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${
                item.curva_abc === 'A'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                  : item.curva_abc === 'B'
                  ? 'bg-blue-950 text-blue-300 border-blue-600'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}>
                Curva {item.curva_abc}
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
                {item.tipo_categoria === 'MEDICAMENTO' ? 'MED' : 'PERF'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {item.repassado_de && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-600 whitespace-nowrap"
                  title={`Repassado automaticamente da ${item.repassado_de} (não atingiu o pedido mínimo)`}
                >
                  🔄 Ex-{item.repassado_de.split(' ')[0]}
                </span>
              )}
              {item.prioridade && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-black border whitespace-nowrap ${
                  item.prioridade === 'P1'
                    ? 'bg-rose-950 text-rose-300 border-rose-600 animate-pulse'
                    : item.prioridade === 'P2'
                    ? 'bg-amber-950 text-amber-300 border-amber-600'
                    : item.prioridade === 'P3'
                    ? 'bg-blue-950 text-blue-300 border-blue-600'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}>
                  {item.prioridade} {item.prioridade === 'P1' ? 'Crítico' : ''}
                </span>
              )}

              {item.falta_balcao_belinha && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-700">
                  🔔 Balcão
                </span>
              )}

              {isJaPedido && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-950 text-blue-300 border border-blue-600 shadow-sm flex items-center gap-1"
                  title={item.ja_pedido_detalhe?.distribuidora ? `Já solicitado em ${item.ja_pedido_detalhe.data || ''} na ${item.ja_pedido_detalhe.distribuidora}` : 'Marcado como Já Pedido'}
                >
                  <PackageCheck className="w-3 h-3 text-blue-400" />
                  <span>Já Pedido</span>
                </span>
              )}

              {item.is_adiado_proxima_semana && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-950 text-indigo-300 border border-indigo-600 animate-pulse flex items-center gap-1" title={`Adiado até ${item.adiar_ate}. Não será cotado nesta semana.`}>
                  📅 Próx. Semana
                </span>
              )}
            </div>
          </div>

          {/* Nome do Produto e Apresentação */}
          <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug hover:text-cyan-300 transition-colors" title={item.descricao}>
            {item.descricao}
          </h3>

          <div className="flex items-center justify-between text-xs text-slate-400 mt-1 mb-2.5">
            <span className="truncate max-w-[150px]">{item.apresentacao || 'Sem apresentação'}</span>
            {item.ean && (
              <button
                type="button"
                onClick={(e) => handleCopiarEan(item.ean, e)}
                className="inline-flex items-center gap-1 font-mono text-[11px] text-cyan-400 hover:text-cyan-200 bg-[#06101d] px-1.5 py-0.5 rounded border border-cyan-900/60 transition-colors cursor-pointer"
                title="Copiar código EAN de barras"
              >
                {copiadoEan === item.ean ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{item.ean}</span>
              </button>
            )}
          </div>

          {/* Grade de Estoque e Vendas (4 Blocos) */}
          <div className="grid grid-cols-4 gap-1 sm:gap-1.5 bg-[#070e1c] p-1.5 sm:p-2 rounded-xl border border-slate-800/80 mb-3 text-center">
            <div>
              <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">Saldo</span>
              <span className={`text-xs font-black ${isRuptura ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`}>
                {item.saldo} un
              </span>
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">Cobert.</span>
              <span className={`text-xs font-bold ${item.dias_estoque_restante <= 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                {item.dias_estoque_restante <= 0 ? '0d' : `${item.dias_estoque_restante}d`}
              </span>
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">VMD</span>
              <span className="text-xs font-bold text-slate-200">
                {item.vmd_ponderado}
              </span>
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">30 Dias</span>
              <span className="text-xs font-bold text-slate-200">
                {item.vendas_30d} un
              </span>
            </div>
          </div>

          {/* Caixa de Sugestão 7d e Subtotal */}
          <div className="flex items-center justify-between bg-cyan-950/30 px-3 py-2 rounded-xl border border-cyan-800/60 mb-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-cyan-300 block">Pedir (7 Dias)</span>
              <span className="text-base font-black text-cyan-200">
                {item.qtd_sugerida_7d} un
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Subtotal Est.</span>
              <span className="text-base font-black text-white">
                R$ {item.subtotal_7d.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Comparativo de Preços (Última Compra vs 1º e 2º Colocados) */}
          <div className="space-y-2 bg-[#081020] p-2.5 rounded-xl border border-slate-800/90 mb-3 text-xs">
            {/* Última Compra */}
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-slate-400 text-[11px]">Última Compra:</span>
              <div className="text-right">
                <b className="text-amber-300 font-black">
                  {precoUltCompra > 0 ? `R$ ${precoUltCompra.toFixed(2)}` : '—'}
                </b>
                {item.fornecedor_ult_compra && (
                  <span className="text-[10px] text-slate-500 block truncate max-w-[130px]" title={`${item.fornecedor_ult_compra} ${dataUltFormatada ? `(${dataUltFormatada})` : ''}`}>
                    {item.fornecedor_ult_compra}
                  </span>
                )}
              </div>
            </div>

            {/* 1º Colocado (Vencedor) */}
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-800">
              <div className="flex flex-col truncate max-w-[135px]">
                <span className="text-[10px] uppercase font-black text-cyan-400">1º Colocado</span>
                {(() => {
                  const link1 = obterLinkDistribuidoraProduto(item, 1);
                  return link1 ? (
                    <a
                      href={link1}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleAbrirLinkDistribuidora(item)}
                      className="text-xs font-bold text-emerald-300 hover:text-white hover:underline truncate inline-flex items-center gap-1 group"
                      title={`Conferir no portal da ${fornecedor1}`}
                    >
                      <span className="truncate">{fornecedor1}</span>
                      <ExternalLink className="w-3 h-3 text-emerald-400 group-hover:scale-125 transition-transform shrink-0" />
                    </a>
                  ) : (
                    <span className="text-xs font-bold text-emerald-300 truncate">{fornecedor1}</span>
                  );
                })()}

                {/* Badge de Campanha Comercial Especial (ex: Unilever, Nívea, Dapa) */}
                {item.condicao_comercial_1 && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-black text-amber-300 bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-700/70 mt-0.5 truncate max-w-[150px]"
                    title={`🏷️ Campanha: ${item.condicao_comercial_1}${item.preco_padrao_1 ? ` | Preço Padrão: R$ ${item.preco_padrao_1.toFixed(2)}` : ''}`}
                  >
                    🏷️ {item.condicao_comercial_1.length > 20 ? item.condicao_comercial_1.slice(0, 18) + '...' : item.condicao_comercial_1}
                  </span>
                )}

                {/* Badge de Genérico Mais Barato Encontrado */}
                {item.is_generico_mais_barato_1 && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-black text-cyan-300 bg-cyan-950/90 px-1.5 py-0.5 rounded border border-cyan-700/70 mt-0.5"
                    title="⚡ Oferta vencedora encontrada em genérico equivalente com mesmo princípio ativo, dosagem e forma farmacêutica"
                  >
                    ⚡ Genérico Mais Barato
                  </span>
                )}

                {/* Badge de Substituto Eleito por Essência */}
                {item.is_substituto_1 && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-black text-purple-300 bg-purple-950/90 px-1.5 py-0.5 rounded border border-purple-700/70 mt-0.5"
                    title={`⚡ Substituto eleito por menor preço: ${item.laboratorio_1 || 'Genérico'} (EAN: ${item.ean_substituto_1})`}
                  >
                    ⚡ {item.laboratorio_1 ? `Subst: ${item.laboratorio_1}` : 'Substituto'}
                  </span>
                )}
              </div>

              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-black text-emerald-300">
                    {preco1 !== null ? `R$ ${preco1.toFixed(2)}` : '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setModalConcorrentesEssencia({ isOpen: true, produto: item })}
                    className="p-1 rounded bg-[#06101f] text-purple-400 hover:text-white border border-purple-800/80 transition-colors cursor-pointer"
                    title="Ver opções concorrentes cotadas na essência farmacológica"
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalHistoricoPreco({ isOpen: true, produto: item })}
                    className="p-1 rounded bg-[#06101f] text-cyan-400 hover:text-white border border-cyan-800/80 transition-colors cursor-pointer"
                    title="Ver série temporal e compras reais"
                  >
                    <LineChart className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRecotarProduto(item)}
                    disabled={recotandoEan === item.ean}
                    className={`p-1 rounded border transition-colors cursor-pointer ${
                      recotandoEan === item.ean
                        ? 'bg-amber-950 text-amber-300 border-amber-600 animate-pulse'
                        : 'bg-[#06101f] text-cyan-400 hover:text-white border-cyan-800/80 hover:border-cyan-400'
                    }`}
                    title={`Re-cotar "${item.descricao}" sob demanda com os robôs`}
                  >
                    <RotateCcw className={`w-3 h-3 ${recotandoEan === item.ean ? 'animate-spin text-amber-300' : ''}`} />
                  </button>
                </div>

                {/* Badge Economia vs Última Compra */}
                {preco1 && precoUltCompra > 0 && (
                  <span className={`text-[10px] font-black px-1.5 py-0.2 rounded mt-0.5 ${
                    economizou
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : 'bg-rose-950 text-rose-300 border border-rose-700'
                  }`}>
                    {economizou ? `Economia: -R$ ${diferencaReais.toFixed(2)} (-${Math.abs(diffUltCompra)}%)` : `+R$ ${Math.abs(diferencaReais).toFixed(2)} (+${diffUltCompra}%)`}
                  </span>
                )}
              </div>
            </div>

            {/* 2º Colocado */}
            {fornecedor2 && preco2 && (
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-slate-400">
                <span className="text-[11px] truncate max-w-[135px]">2º: {fornecedor2}</span>
                <span className="text-xs font-bold text-slate-300">
                  R$ {preco2.toFixed(2)} {diff2Colocado > 0 && <span className="text-[10px] text-amber-400 font-bold">+{diff2Colocado}%</span>}
                </span>
              </div>
            )}

            {/* Aviso de Menor Preço Fora da Janela Selecionada */}
            {item.melhor_fora_janela && (
              <div className="pt-1.5 border-t border-slate-800/80 text-[10px] text-amber-300/90 flex items-center justify-between gap-1 bg-amber-950/30 p-1.5 rounded-lg border border-amber-800/40 mt-1" title={item.melhor_fora_janela.motivo}>
                <span className="truncate max-w-[135px] flex items-center gap-1">
                  <Info className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Global: {item.melhor_fora_janela.distribuidora}</span>
                </span>
                <span className="font-bold text-amber-200 shrink-0">
                  R$ {item.melhor_fora_janela.preco.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Botão de Re-cotar com Robô em Cada Produto (Solicitado pelo Usuário) */}
          <div className="mb-2.5">
            <button
              type="button"
              onClick={() => handleRecotarProduto(item)}
              disabled={recotandoEan === item.ean}
              className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-black transition-all border cursor-pointer ${
                recotandoEan === item.ean
                  ? 'bg-amber-950/90 text-amber-300 border-amber-600 animate-pulse shadow-md shadow-amber-950/50'
                  : 'bg-gradient-to-r from-[#0d2038] via-cyan-950/60 to-[#0a182c] hover:from-cyan-900 hover:to-blue-900 text-cyan-300 hover:text-white border-cyan-800/80 hover:border-cyan-400 shadow-sm'
              }`}
              title={`Acionar os robôs agora para pesquisar o preço ao vivo de "${item.descricao}" nos portais`}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${recotandoEan === item.ean ? 'animate-spin text-amber-300' : 'text-cyan-400'}`} />
              <span>{recotandoEan === item.ean ? 'Re-cotando nos Portais...' : '🔄 Re-cotar Este Produto'}</span>
            </button>
          </div>
        </div>

        {/* RODAPÉ DO CARD: REGRAS DE DECISÃO E JUSTIFICATIVA (SOLICITADO PELO USUÁRIO) */}
        <div className="pt-2.5 border-t border-slate-800/80 space-y-2 mt-auto">
          {/* Opção 4: Marcar como Já Pedido (Solicitado pelo Usuário) */}
          <button
            type="button"
            onClick={(e) => handleAlternarJaPedido(item, e)}
            className={`w-full flex items-center justify-between p-2 px-3 rounded-xl border cursor-pointer transition-all select-none text-left ${
              isJaPedido
                ? 'bg-blue-950/90 border-blue-500 text-blue-200 font-black shadow-md ring-1 ring-blue-400/40'
                : 'bg-[#060c18] border-slate-800 text-slate-400 hover:text-blue-300 hover:border-blue-800/60'
            }`}
            title={
              isJaPedido
                ? 'Produto já solicitado! Clique para reativá-lo e colocá-lo de volta na lista de compras ativa.'
                : 'Clique se este produto já foi pedido/comprado (libera a cota para o próximo produto da fila)'
            }
          >
            <div className="flex items-center gap-2">
              <PackageCheck className={`w-4 h-4 shrink-0 ${isJaPedido ? 'text-blue-400' : 'text-slate-400'}`} />
              <div className="flex flex-col">
                <span className="text-xs font-bold leading-tight">
                  {isJaPedido ? '📦 Já Pedido (Compra Feita)' : '📦 Marcar como Já Pedido'}
                </span>
                {item.ja_pedido_detalhe?.distribuidora && (
                  <span className="text-[10px] text-blue-300/80 font-normal">
                    {item.ja_pedido_detalhe.distribuidora} ({item.ja_pedido_detalhe.data})
                  </span>
                )}
              </div>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
              isJaPedido
                ? 'bg-blue-900/90 text-blue-100 border border-blue-500'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}>
              {isJaPedido ? 'Desmarcar' : 'Já Pedido'}
            </span>
          </button>

          {/* Opção 3: Cotar na Próxima Semana (Solicitado pelo Usuário) */}
          <button
            type="button"
            onClick={(e) => handleAlternarAdiarProximaSemana(item, e)}
            className={`w-full flex items-center justify-between p-2 px-3 rounded-xl border cursor-pointer transition-all select-none text-left ${
              item.is_adiado_proxima_semana
                ? 'bg-indigo-950/90 border-indigo-500 text-indigo-200 font-black shadow-md ring-1 ring-indigo-400/40'
                : 'bg-[#060c18] border-slate-800 text-slate-400 hover:text-indigo-300 hover:border-indigo-800/60'
            }`}
            title={
              item.is_adiado_proxima_semana
                ? `Produto adiado até ${item.adiar_ate}. Não será cotado pelos robôs nem entrará no carrinho nesta semana. (Clique para cancelar e reativar cotação agora)`
                : 'Clique para deixar este produto para cotar apenas na próxima semana (+7 dias)'
            }
          >
            <div className="flex items-center gap-2">
              <Calendar className={`w-4 h-4 shrink-0 ${item.is_adiado_proxima_semana ? 'text-indigo-400 animate-pulse' : 'text-slate-400'}`} />
              <div className="flex flex-col">
                <span className="text-xs font-bold leading-tight">
                  {item.is_adiado_proxima_semana ? '📅 Adiado p/ Próx. Semana' : '📅 Deixar p/ Cotar Próx. Semana'}
                </span>
                {item.is_adiado_proxima_semana && item.adiar_ate && (
                  <span className="text-[10px] text-indigo-300/80 font-normal">
                    Bloqueado até {item.adiar_ate.split('-').reverse().slice(0, 2).join('/')}
                  </span>
                )}
              </div>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
              item.is_adiado_proxima_semana
                ? 'bg-indigo-900/90 text-indigo-100 border border-indigo-500'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}>
              {item.is_adiado_proxima_semana ? 'Reativar Agora' : '+7 dias'}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Opção 1: Não colocar no carrinho */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAtualizarRegraProduto(item, 'nao_carrinho', !isBloqueadoCarrinho);
              }}
              className={`flex items-center gap-1.5 p-1.5 rounded-xl border cursor-pointer transition-all select-none text-left ${
                isBloqueadoCarrinho
                  ? 'bg-amber-950/90 border-amber-500 text-amber-200 font-black shadow-md ring-1 ring-amber-400/40'
                  : 'bg-[#060c18] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
              title={isBloqueadoCarrinho ? 'Produto BLOQUEADO: não será inserido no carrinho da distribuidora (Clique para liberar)' : 'Clique para BLOQUEAR este produto e impedi-lo de entrar no carrinho'}
            >
              <input
                type="checkbox"
                checked={isBloqueadoCarrinho}
                readOnly
                className="pointer-events-none rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 cursor-pointer shrink-0"
              />
              <span className="text-[11px] leading-tight font-bold">🚫 Não colocar no carrinho</span>
            </button>

            {/* Opção 2: Não cotar */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAtualizarRegraProduto(item, 'nao_cotar', !isNaoCotar);
              }}
              className={`flex items-center gap-1.5 p-1.5 rounded-xl border cursor-pointer transition-all select-none text-left ${
                isNaoCotar
                  ? 'bg-rose-950/90 border-rose-500 text-rose-200 font-black shadow-md ring-1 ring-rose-400/40'
                  : 'bg-[#060c18] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
              title={isNaoCotar ? 'Produto MARCADO PARA NÃO COTAR: os robôs irão ignorá-lo (Clique para liberar)' : 'Clique para IGNORAR este produto nas próximas cotações de robôs'}
            >
              <input
                type="checkbox"
                checked={isNaoCotar}
                readOnly
                className="pointer-events-none rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-0 cursor-pointer shrink-0"
              />
              <span className="text-[11px] leading-tight font-bold">🛑 Não cotar</span>
            </button>
          </div>

          {/* Campo de Justificativa com chips de motivo rápido */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={justificativaEditando[item.produto_id] !== undefined ? justificativaEditando[item.produto_id] : (item.motivo_justificativa || '')}
                onChange={(e) => setJustificativaEditando(prev => ({ ...prev, [item.produto_id]: e.target.value }))}
                onBlur={(e) => handleAtualizarRegraProduto(item, 'motivo_justificativa', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAtualizarRegraProduto(item, 'motivo_justificativa', (e.target as HTMLInputElement).value);
                  }
                }}
                placeholder="Justificativa (ex: estoque em trânsito...)"
                className="w-full bg-[#060d19] border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            {/* Chips Rápidos de Motivo em 1 Toque */}
            <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
              <span className="text-[9px] uppercase font-bold text-slate-500">Motivos:</span>
              {['Em trânsito', 'Descontinuado', 'Substituído', 'Sem giro', 'Preço alto'].map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setJustificativaEditando(prev => ({ ...prev, [item.produto_id]: chip }));
                    handleAtualizarRegraProduto(item, 'motivo_justificativa', chip);
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700/60"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Contagem de itens que possuem cotação e estão pendentes de decisão
  const itensPendentesDecisaoCount = useMemo(() => {
    return faltas.filter(f => {
      if (f.nao_cotar || f.is_adiado_proxima_semana || (f as any).is_enviado_carrinho_semana) return false;
      const temCotacao = Boolean(f.preco_1 && f.preco_1 > 0 && f.fornecedor_1 && f.fornecedor_1 !== 'Sem Estoque (Portais)' && f.fornecedor_1 !== 'Não Cotado');
      return temCotacao;
    }).length;
  }, [faltas]);

  // Funções de manipulação para a aba de Decisão de Compras
  const handleAlterarQtdDecisao = (produtoId: number, novaQtd: number) => {
    setFaltasRaw(prev => prev.map(f => {
      if (f.produto_id !== produtoId) return f;
      const preco = f.preco_1 || f.preco_ult_compra || f.custo_unitario || 0;
      return {
        ...f,
        qtd_manual_override: novaQtd,
        qtd_sugerida_7d: novaQtd,
        subtotal_7d: Number((novaQtd * preco).toFixed(2))
      } as any;
    }));
  };

  const handleEscolherFornecedorDecisao = (
    produtoId: number,
    posicao: 1 | 2,
    fornecedorOverride?: string,
    precoOverride?: number,
    urlOverride?: string | null
  ) => {
    setFaltasRaw(prev => prev.map(f => {
      if (f.produto_id !== produtoId) return f;
      if (fornecedorOverride && precoOverride && precoOverride > 0) {
        return {
          ...f,
          fornecedor_1: fornecedorOverride,
          preco_1: precoOverride,
          url_produto_1: urlOverride !== undefined ? urlOverride : f.url_produto_1,
          subtotal_7d: Number(((f.qtd_sugerida_7d || 1) * precoOverride).toFixed(2))
        };
      }
      if (posicao === 2 && f.fornecedor_2 && f.preco_2) {
        return {
          ...f,
          fornecedor_1: f.fornecedor_2,
          preco_1: f.preco_2,
          url_produto_1: f.url_produto_2,
          fornecedor_2: f.fornecedor_1,
          preco_2: f.preco_1,
          url_produto_2: f.url_produto_1,
          subtotal_7d: Number((f.qtd_sugerida_7d * f.preco_2).toFixed(2))
        };
      }
      return f;
    }));
  };

  // Lista unificada de Módulos para Navegação Desktop e Mobile
  const modulosNav = useMemo(() => [
    { id: 'pesquisa_precos' as const, label: '🔍 Pesquisa de Preços', shortLabel: 'Pesquisa', icon: <Search className="w-4 h-4 text-cyan-400" />, badge: 0 },
    { id: 'decisao' as const, label: '🎯 Decisão de Compras', shortLabel: 'Decisão', icon: <Sparkles className="w-4 h-4 text-amber-400" />, badge: itensPendentesDecisaoCount },
    { id: 'cotacoes_matriz' as const, label: '📊 Tabela de Cotações', shortLabel: 'Cotações', icon: <Table className="w-4 h-4 text-emerald-400" />, badge: 0 },
    { id: 'faltas' as const, label: '1. Extrema Necessidade', shortLabel: 'Extrema Necessidade', icon: <AlertTriangle className="w-4 h-4 text-amber-400" />, badge: faltas.length },
    { id: 'cotacao' as const, label: '2. Portais & Carrinho', shortLabel: 'Portais', icon: <Globe className="w-4 h-4 text-blue-400" />, badge: carrinhosOtimizados.length },
    { id: 'pedidos' as const, label: '3. Meus Pedidos & NF', shortLabel: 'Pedidos', icon: <ShoppingCart className="w-4 h-4 text-amber-400" />, badge: 0 },
    { id: 'orcamento' as const, label: '4. Radar de Orçamento', shortLabel: 'Orçamento', icon: <DollarSign className="w-4 h-4 text-emerald-400" />, badge: 0 },
    { id: 'relatorios' as const, label: '5. Relatórios & Preços', shortLabel: 'Relatórios', icon: <BarChart3 className="w-4 h-4 text-purple-400" />, badge: 0 },
    { id: 'simulador' as const, label: '6. Simulador de Giro', shortLabel: 'Giro', icon: <Calendar className="w-4 h-4 text-teal-400" />, badge: 0 }
  ], [itensPendentesDecisaoCount, faltas.length, carrinhosOtimizados.length]);

  return (
    <div className="flex-1 flex flex-col h-screen w-screen overflow-hidden bg-[#070b14] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* ─── TOPO STANDALONE EXECUTIVO DO BELAPED ───────────────────────────── */}
      <header className="h-14 sm:h-16 px-2.5 sm:px-4 md:px-8 bg-[#0b1222] border-b border-cyan-900/40 flex items-center justify-between shrink-0 shadow-lg relative z-20">
        
        {/* Esquerda: Botão Menu Mobile, Botão Voltar ao BelaFarma e Marca BelaPed */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Botão Hambúrguer Mobile (Abre Drawer de Módulos e Filtros) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-cyan-400 hover:text-white border border-slate-700/60 transition-all cursor-pointer shadow-sm"
            title="Abrir Menu de Módulos e Filtros"
          >
            <Menu className="w-4 h-4" />
          </button>

          {onNavigate && (
            <button
              onClick={() => onNavigate('dashboard')}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-bold transition-all shadow-sm cursor-pointer group"
              title="Voltar para a operação do BelaFarma"
            >
              <ArrowLeft className="w-4 h-4 text-cyan-400 group-hover:-translate-x-1 transition-transform shrink-0" />
              <span className="hidden sm:inline">Voltar ao BelaFarma</span>
              <span className="sm:hidden text-[11px]">Voltar</span>
            </button>
          )}

          <div className="h-6 w-px bg-slate-800 hidden md:block"></div>

          <div className="flex items-center gap-2">
            <div className="p-1.5 sm:p-2 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl shadow-md text-white shrink-0">
              <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-base sm:text-lg font-black tracking-tight bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-300 bg-clip-text text-transparent uppercase">
                  BelaPed
                </span>
                <span className="hidden sm:inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/80 tracking-wider">
                  B2B Procurement
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium hidden md:block">
                Cotações Multi-Portais • Regime Vendeu/Comprou (7d) • Trava de Orçamento
              </p>
            </div>
          </div>
        </div>

        {/* Direita: Status dos Portais, Usuário e Botões Rápidos */}
        <div className="flex items-center gap-1.5 sm:gap-3">
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

          {/* Badge de Versão do Sistema & Auditoria de Builds */}
          <button
            type="button"
            onClick={() => setVersionModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm group"
            title="Ver detalhes da versão, descrição das mudanças e checar atualizações"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span>v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.2.0'}</span>
            <span className="text-slate-500">#{typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev'}</span>
          </button>

          {/* Botão de Exibir Apenas a Tabela no Header */}
          <button
            onClick={alternarModoApenasTabela}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-md cursor-pointer border ${
              modoApenasTabela
                ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400'
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-cyan-800/60'
            }`}
            title={modoApenasTabela ? 'Exibir o menu lateral e painéis completos' : 'Ocultar menus e focar 100% na tabela de produtos'}
          >
            <Table className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{modoApenasTabela ? '← Painel Completo' : 'Apenas Tabela'}</span>
          </button>

          {/* Botão de Exportar TXT no Header */}
          <button
            onClick={() => setModalExportarTxtOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold transition-all shadow-md cursor-pointer"
            title="Exportar produtos em arquivo TXT separado por categorias e fornecedor"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Exportar TXT</span>
          </button>

          <button
            onClick={handleSincronizarManual}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black transition-all shadow-md cursor-pointer disabled:opacity-50"
            title="Forçar sincronização imediata de estoque, correções e compras com o ERP Digifarma"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{refreshing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>
        </div>
      </header>

      {/* ─── CORPO PRINCIPAL COM SCROLL INTERNO ──────────────────────────────── */}
      {/* ─── MENU LATERAL EXCLUSIVO DO BELAPED + CORPO ───────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* SIDEBAR DESKTOP */}
        {!modoApenasTabela && (
          <aside className="hidden md:flex w-64 shrink-0 bg-[#0b1222] border-r border-slate-800/80 flex-col overflow-y-auto custom-scrollbar">
            <nav className="p-3 space-y-1.5">
              <span className="px-2 text-[10px] font-black uppercase tracking-widest text-cyan-400/80 block mb-1">
                Módulos Exclusivos BelaPed
              </span>
              {modulosNav.map(item => (
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
        )}

        {/* DRAWER LATERAL MOBILE (GAVETA DESLIZANTE PARA TELAS PEQUENAS / S21) */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden animate-in fade-in duration-200">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Drawer */}
            <aside className="relative w-72 max-w-[85vw] h-full bg-[#0b1222] border-r border-slate-800 flex flex-col shadow-2xl z-10 overflow-y-auto custom-scrollbar">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-lg text-white">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-black text-sm uppercase text-white tracking-wide block">Menu BelaPed</span>
                    <span className="text-[10px] text-cyan-400 font-bold block">Navegação & Filtros</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-900 border border-slate-700 cursor-pointer"
                  title="Fechar menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Módulos do BelaPed */}
              <nav className="p-3 space-y-1.5">
                <span className="px-2 text-[10px] font-black uppercase tracking-widest text-cyan-400/80 block mb-1">
                  Módulos Exclusivos BelaPed
                </span>
                {modulosNav.map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
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
                    setMobileMenuOpen(false);
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
                          setMobileMenuOpen(false);
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

              {/* Ações Rápidas no Menu Lateral */}
              <div className="p-3 border-t border-slate-800/80 space-y-2 mt-auto">
                <span className="px-2 text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                  Ações Rápidas
                </span>
                <button
                  onClick={() => {
                    setActiveTab('faltas');
                    setAgruparPorDistribuidora(prev => !prev);
                    setMobileMenuOpen(false);
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
                  onClick={() => {
                    setAvulsoModalOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-black uppercase cursor-pointer border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-all"
                >
                  <Plus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Adicionar Item Avulso</span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* BARRA FIXA INFERIOR DE NAVEGAÇÃO MOBILE (S21 / TOUCH FRIENDLY) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0b1222]/95 backdrop-blur-md border-t border-cyan-900/50 px-1 py-1 flex items-center justify-around shadow-2xl belaped-no-print">
          {modulosNav.slice(0, 5).map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all relative ${
                  isActive ? 'text-cyan-400 font-black' : 'text-slate-400 font-medium hover:text-slate-200'
                }`}
              >
                <div className="relative">
                  {item.icon}
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 px-1 py-0.2 rounded-full text-[9px] font-black bg-cyan-500 text-slate-950">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-0.5 truncate max-w-[62px]">{item.shortLabel}</span>
              </button>
            );
          })}
          
          {/* Botão Mais (Abre Drawer de Menu) */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl text-slate-400 hover:text-cyan-300 transition-all cursor-pointer"
          >
            <Menu className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] mt-0.5 font-bold">Mais</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 sm:p-4 md:p-6 pb-20 md:pb-6 space-y-4 md:space-y-5 bg-gradient-to-b from-[#070b14] via-[#09101f] to-[#070b14]">
        
        {/* ─── BARRA DA REGRA MASTER: ORÇAMENTO & VENCIMENTO DE BOLETOS ─────────── */}
        {orcamentoInfo && !modoApenasTabela && (
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


        {/* ─── ABA: PESQUISA DE PREÇOS & COTAÇÃO MULTI-DISTRIBUIDORA ─── */}
        {activeTab === 'pesquisa_precos' && (
          <BelaPedPesquisaPrecosTab
            janelaAlvoSelecionada={janelaAlvoSelecionada}
            janelaAtivaData={janelaAtivaData}
            addToast={addToast}
            user={user}
            onNavegarTab={setActiveTab}
            onAlternarJaPedido={handleAlternarJaPedido}
          />
        )}

        {/* ─── ABA 0: DECISÃO DE COMPRAS (CARROSSEL FOCAL PRODUTO A PRODUTO) ─── */}
        {activeTab === 'decisao' && (
          <BelaPedDecisaoTab
            faltas={faltas}
            portais={portais}
            itensSelecionados={itensSelecionados}
            setItensSelecionados={setItensSelecionados}
            onAlterarQtd={handleAlterarQtdDecisao}
            onEscolherFornecedor={handleEscolherFornecedorDecisao}
            onAtualizarRegra={handleAtualizarRegraProduto}
            onAbrirVerCarrinhos={handleAbrirModalVerCarrinhos}
            onNavegarTab={setActiveTab}
            onRecarregarDados={carregarDados}
          />
        )}

        {/* ─── ABA: TABELA & MATRIZ GERAL DE COTAÇÕES (TODOS OS PORTAIS) ────── */}
        {activeTab === 'cotacoes_matriz' && (
          <BelaPedCotacoesMatrizTab
            onVerHistoricoPrecos={(ean, prodId, desc) => {
              const achado = faltas.find(f => (ean && f.ean === ean) || f.produto_id === prodId);
              setModalHistoricoPreco({
                isOpen: true,
                produto: achado || ({
                  produto_id: prodId,
                  descricao: desc,
                  apresentacao: '',
                  ean: ean || '',
                  curva_abc: 'A',
                  saldo: 0,
                  vmd_ponderado: 0,
                  vendas_30d: 0,
                  dias_estoque_restante: 0,
                  status_ruptura: 'RUPTURA',
                  custo_unitario: 0,
                  preco_venda_vigente: 0,
                  margem_lucro_percentual: 0,
                  fornecedor_ult_compra: '',
                  data_ult_compra: '',
                  nf_ult_compra: '',
                  qtd_sugerida_7d: 1,
                  subtotal_7d: 0,
                  tipo_categoria: 'MEDICAMENTO'
                } as FaltaItem7d)
              });
            }}
            onNavegarTab={setActiveTab}
          />
        )}

        {activeTab === 'pedidos' && <PedidosTab />}

        {/* ─── ABA 1: FALTAS & REPOSIÇÃO 1 SEMANA ─────────────────────────────── */}
        {activeTab === 'faltas' && (
          <div className="space-y-4">
            {/* ─── BARRA SUPERIOR DE VISÃO & FERRAMENTAS DO BELAPED ─────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#0a1426] p-2.5 px-3.5 rounded-2xl border border-cyan-800/60 shadow-md">
              <div className="flex flex-wrap items-center gap-2">
                {/* Botão de Exibir Apenas a Tabela / Restaurar Painéis */}
                <button
                  onClick={alternarModoApenasTabela}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border shadow-lg ${
                    modoApenasTabela
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white border-amber-400 shadow-amber-950/60 ring-2 ring-amber-400/40'
                      : 'bg-gradient-to-r from-cyan-600 via-teal-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-cyan-300 shadow-cyan-950/60 ring-2 ring-cyan-400/50'
                  }`}
                  title={modoApenasTabela ? 'Exibir o menu lateral e painéis completos do topo' : 'Exibir apenas a tabela (oculta menus e painéis para 100% de visão)'}
                >
                  <Table className="w-4 h-4 text-white" />
                  <span>{modoApenasTabela ? '← Exibir Painel Completo' : '📊 Exibir Apenas a Tabela'}</span>
                </button>

                {/* Botão de Exportar TXT por Fornecedor & Categorias */}
                <button
                  onClick={() => setModalExportarTxtOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-black transition-all cursor-pointer shadow-md"
                  title="Gerar e baixar arquivo TXT organizado por categorias e fornecedor"
                >
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span>📄 Exportar TXT</span>
                </button>

                {/* Botão da Guia de Faltas do Balcão (Livro de Faltas do Belinha) */}
                <button
                  onClick={() => setGavetaBalcaoAberta(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fuchsia-950/80 hover:bg-fuchsia-900/80 text-fuchsia-300 border border-fuchsia-700/70 text-xs font-black transition-all cursor-pointer shadow-sm"
                  title="Abrir a gaveta com todos os produtos anotados no Livro de Faltas do balcão pelos balconistas"
                >
                  <ClipboardList className="w-3.5 h-3.5 text-fuchsia-400" />
                  <span>Faltas do Balcão ({faltasBalcaoBelinha.length})</span>
                </button>

                {/* Toggle para filtrar apenas produtos do balcão */}
                <button
                  onClick={() => setFiltroApenasBalcao(prev => !prev)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    filtroApenasBalcao
                      ? 'bg-fuchsia-600 text-white border-fuchsia-400 font-black shadow-md'
                      : 'bg-[#080d18] text-fuchsia-400 border-fuchsia-900/60 hover:border-fuchsia-600'
                  }`}
                  title="Filtrar tabela para mostrar somente itens anotados no balcão da farmácia"
                >
                  <span>{filtroApenasBalcao ? '✓ Só Faltas Balcão' : 'Filtrar Balcão'}</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-black/40 font-black">
                    {faltas.filter(f => f.falta_balcao_belinha).length}
                  </span>
                </button>

                {/* Seletor de Modo: CARDS vs TABELA */}
                <div className="flex items-center bg-[#070e1b] p-1 rounded-xl border border-slate-700 shadow-inner">
                  <button
                    onClick={() => alternarModoVisualizacao('cards')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      modoVisualizacao === 'cards'
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-950/60 ring-1 ring-cyan-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Exibir os produtos em Cards detalhados com controles de bloqueio e justificativas"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>🗂️ Cards</span>
                  </button>
                  <button
                    onClick={() => alternarModoVisualizacao('tabela')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      modoVisualizacao === 'tabela'
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-950/60 ring-1 ring-cyan-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Exibir os produtos na tabela clássica"
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>📊 Tabela</span>
                  </button>
                </div>

                {/* Filtro Rápido de Regras de Bloqueio */}
                <div className="flex items-center gap-1 bg-[#070e1b] p-1 rounded-xl border border-slate-800 text-[11px]">
                  <button
                    onClick={() => setFiltroRegras('TODOS')}
                    className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      filtroRegras === 'TODOS'
                        ? 'bg-slate-700 text-white font-black'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Todos ({faltas.length})
                  </button>
                  <button
                    onClick={() => setFiltroRegras('BLOQUEADOS_CARRINHO')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      filtroRegras === 'BLOQUEADOS_CARRINHO'
                        ? 'bg-amber-600 text-white font-black shadow-sm'
                        : 'text-amber-400/90 hover:text-amber-300'
                    }`}
                    title="Filtrar produtos marcados para NÃO colocar no carrinho"
                  >
                    <Ban className="w-3 h-3 text-amber-300" />
                    <span>Bloq. Carrinho ({faltas.filter(f => f.nao_carrinho).length})</span>
                  </button>
                  <button
                    onClick={() => setFiltroRegras('NAO_COTAR')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      filtroRegras === 'NAO_COTAR'
                        ? 'bg-rose-600 text-white font-black shadow-sm'
                        : 'text-rose-400/90 hover:text-rose-300'
                    }`}
                    title="Filtrar produtos marcados para NÃO cotar"
                  >
                    <Ban className="w-3 h-3 text-rose-300" />
                    <span>Não Cotar ({faltas.filter(f => f.nao_cotar).length})</span>
                  </button>
                  <button
                    onClick={() => setFiltroRegras('ADIADOS_PROXIMA_SEMANA')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      filtroRegras === 'ADIADOS_PROXIMA_SEMANA'
                        ? 'bg-indigo-600 text-white font-black shadow-sm'
                        : 'text-indigo-400/90 hover:text-indigo-300'
                    }`}
                    title="Filtrar produtos adiados para cotar na próxima semana"
                  >
                    <Calendar className="w-3 h-3 text-indigo-300" />
                    <span>Próx. Semana ({faltas.filter(f => f.is_adiado_proxima_semana).length})</span>
                  </button>
                </div>
              </div>

              {/* Indicadores Compactos quando no Modo Expandido */}
              {modoTabelaExpandida && (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-slate-300">
                    Produtos: <b className="text-white">{faltasFiltradas.length}</b>
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-300">
                    Selecionados: <b className="text-emerald-400">R$ {totaisSelecionados.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-300">
                    Teto Disp.: <b className="text-cyan-300">R$ {analiseOrcamentoSobra.tetoComprasDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</b>
                  </span>
                </div>
              )}
            </div>

            {/* Painéis Executivos do Topo (ocultos quando em modoTabelaExpandida para maximizar área da tabela) */}
            {!modoTabelaExpandida && (
              <>
                {/* ─── PAINEL TREMOR DE INDICADORES EXECUTIVOS ─────────────────────── */}
                <BelaPedResumoTremor faltas={faltas} totais={totaisPorDistribuidora} />

                {/* ─── PAINEL ESTRATÉGICO: TRAVA ORÇAMENTÁRIA POR JANELA & COTA SEMANAL ENXUTA ─── */}
                <div className="bg-gradient-to-r from-[#0a1426] via-[#0d1c35] to-[#091222] p-4 rounded-2xl border border-cyan-800/80 shadow-xl space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2.5 rounded-xl bg-cyan-950/90 border border-cyan-600/50 text-cyan-400">
                        <Wallet className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-cyan-300">
                            Gestão Orçamentária por Janela & Cota Semanal Enxuta
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950/90 text-emerald-300 border border-emerald-700/60">
                            COTA 80% • RESERVA 20%
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium mt-0.5">
                          Limita o pedido para abastecer 1 semana com proteção de caixa, mantendo compras até a última semana do mês.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={handleAutoPreencherCotaSemanal}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-md cursor-pointer transition-all active:scale-95"
                        title="Seleciona automaticamente os produtos mais urgentes (A e faltas) até atingir os 80% da cota semanal segura"
                      >
                        <Zap className="w-4 h-4 text-emerald-200" />
                        <span>⚡ Preencher Cota Enxuta (80%)</span>
                      </button>

                      <button
                        onClick={() => setOrcamentoSemanalModalOpen(true)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-700 to-blue-700 hover:from-cyan-600 hover:to-blue-600 text-white text-xs font-black shadow-md cursor-pointer transition-all active:scale-95"
                        title="Consultar divisão do orçamento por semanas em todos os meses do ano"
                      >
                        <CalendarCheck className="w-4 h-4 text-cyan-200" />
                        <span>Consultar Limites Semanais</span>
                      </button>
                    </div>
                  </div>

                  {/* SELETOR DE JANELA DE VENCIMENTO ALVO (BOLETOS) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-black uppercase text-cyan-300 tracking-wider flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                        Selecione a Janela de Vencimento dos Boletos (Alvo de Pagamento):
                      </span>
                      {janelaAtivaData && (
                        <span className="text-slate-400 text-[11px]">
                          Janela Ativa: <b className="text-white">{janelaAtivaData.nomeMes}</b> ({janelaAtivaData.statusOrcamento})
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                      {(orcamentoInfo?.janelasDisponiveis || []).map(j => {
                        const isSelecionada = (janelaAlvoSelecionada || orcamentoInfo?.janelaAlvoRecomendada) === j.anoMes;
                        return (
                          <button
                            key={j.anoMes}
                            onClick={() => {
                              setJanelaAlvoSelecionada(j.anoMes);
                              carregarDados();
                            }}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                              isSelecionada
                                ? 'bg-cyan-950/90 border-cyan-400 ring-2 ring-cyan-500/40 text-white shadow-lg'
                                : 'bg-[#081120] border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-white">{j.nomeMes}</span>
                              <span className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                                j.statusOrcamento === 'LIBERADO'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : j.statusOrcamento === 'ALERTA'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}>
                                {j.statusOrcamento}
                              </span>
                            </div>
                            <span className="text-xs font-black block mt-1 text-emerald-300">
                              R$ {j.saldoLivre.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-0.5 truncate" title={`Cota 80%: R$ ${j.cotaSemanalSegura.toFixed(0)}/sem`}>
                              Cota: R$ {j.cotaSemanalSegura.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/sem
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Distribuidoras elegíveis para a janela selecionada */}
                    {janelaAtivaData && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#070e1c] border border-slate-800/80 text-[11px] text-slate-300">
                        <span className="text-cyan-400 font-bold shrink-0">🏢 Fornecedores c/ prazo p/ {janelaAtivaData.nomeMes}:</span>
                        <span className="font-semibold truncate">
                          {janelaAtivaData.distribuidorasElegiveis && janelaAtivaData.distribuidorasElegiveis.length > 0
                            ? janelaAtivaData.distribuidorasElegiveis.join(', ')
                            : 'Todos os portais elegíveis'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Indicadores Numéricos da Cota Semanal Enxuta */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs pt-1">
                    {/* Teto Total da Janela */}
                    <div className="p-3 rounded-xl bg-[#081120] border border-slate-800">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">
                        Saldo Livre na Janela ({janelaAtivaData?.nomeMes || 'Mês'})
                      </span>
                      <span className="text-base font-black text-white mt-1 block">
                        R$ {analiseOrcamentoSemanal.saldoLivreMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Teto Total: R$ {analiseOrcamentoSemanal.limiteTotalMes.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </span>
                    </div>

                    {/* Cota Semanal Bruta (100%) */}
                    <div className="p-3 rounded-xl bg-[#081120] border border-slate-800">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">
                        Cota Semanal Bruta (100%)
                      </span>
                      <span className="text-base font-black text-slate-200 mt-1 block">
                        R$ {analiseOrcamentoSemanal.limiteSemanalBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Dividido uniformemente por semana
                      </span>
                    </div>

                    {/* Cota Segura Enxuta (80%) */}
                    <div className="p-3 rounded-xl bg-[#081120] border border-cyan-800/80 shadow-inner">
                      <span className="text-[10px] font-black uppercase text-cyan-400 block flex items-center justify-between">
                        <span>Cota Segura Enxuta (80%)</span>
                        <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 text-[9px] font-black">
                          TETO
                        </span>
                      </span>
                      <span className="text-base font-black text-cyan-200 mt-1 block">
                        R$ {analiseOrcamentoSemanal.cotaSemanalSegura.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-cyan-400/80 block mt-0.5">
                        Teto máximo para compras hoje
                      </span>
                    </div>

                    {/* Reserva de Segurança (20%) */}
                    <div className="p-3 rounded-xl bg-[#081120] border border-emerald-900/60">
                      <span className="text-[10px] font-black uppercase text-emerald-400 block">
                        Reserva Caixa (20%)
                      </span>
                      <span className="text-base font-black text-emerald-300 mt-1 block">
                        R$ {analiseOrcamentoSemanal.reservaSeguranca.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-emerald-400/80 block mt-0.5">
                        Retido p/ proteção de caixa
                      </span>
                    </div>

                    {/* Status do Selecionado x Cota Segura */}
                    <div className={`p-3 rounded-xl border ${
                      analiseOrcamentoSemanal.estaDentroDaCota
                        ? 'bg-emerald-950/40 border-emerald-700/80'
                        : 'bg-rose-950/40 border-rose-700/80'
                    }`}>
                      <span className={`text-[10px] font-black uppercase block flex items-center justify-between ${
                        analiseOrcamentoSemanal.estaDentroDaCota ? 'text-emerald-300' : 'text-rose-300'
                      }`}>
                        <span>{analiseOrcamentoSemanal.estaDentroDaCota ? '✓ Dentro da Cota' : '⚠️ Excedendo Cota'}</span>
                        <span className="text-[9px] font-black">
                          {analiseOrcamentoSemanal.percentualUsoCota}%
                        </span>
                      </span>
                      <span className={`text-base font-black mt-1 block ${
                        analiseOrcamentoSemanal.estaDentroDaCota ? 'text-emerald-200' : 'text-rose-200'
                      }`}>
                        R$ {analiseOrcamentoSemanal.valorSelecionado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      {/* Barra de Progresso */}
                      <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden mt-1.5">
                        <div
                          className={`h-full transition-all duration-300 ${
                            analiseOrcamentoSemanal.estaDentroDaCota ? 'bg-emerald-400' : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.min(100, analiseOrcamentoSemanal.percentualUsoCota)}%` }}
                        ></div>
                      </div>
                      <span className={`text-[10px] block mt-1 ${
                        analiseOrcamentoSemanal.estaDentroDaCota ? 'text-emerald-300/80' : 'text-rose-300/80'
                      }`}>
                        {analiseOrcamentoSemanal.estaDentroDaCota
                          ? `Sobra da Cota: R$ ${analiseOrcamentoSemanal.diferencaCota.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : `Excede em R$ ${Math.abs(analiseOrcamentoSemanal.diferencaCota).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
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
            </>
          )}

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
                        {(() => {
                          const portalInfo = portais.find(p => p.nome && p.nome.toUpperCase() === grp.distribuidora);
                          const prazo = portalInfo?.prazos_boleto || (portalInfo?.prazo_dias_padrao ? `${portalInfo.prazo_dias_padrao} DDL` : null);
                          if (!prazo) return null;
                          return (
                            <span className="text-[10px] text-indigo-300 font-bold block truncate mt-0.5" title={`Prazo de Boleto Bancário: ${prazo}`}>
                              💳 {prazo.length > 20 ? prazo.slice(0, 18) + '..' : prazo}
                            </span>
                          );
                        })()}
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

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-950/70 border border-purple-700/60">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-purple-200">
                    Cotar por Essência:
                  </span>
                  <button
                    onClick={() => setCotarEssenciaAtivo(prev => !prev)}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                      cotarEssenciaAtivo
                        ? 'bg-purple-500 text-slate-950 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                    title="Desvincula do EAN fixo e busca a menor opção de preço pela substância/essência farmacológica idêntica sem viés de marca"
                  >
                    {cotarEssenciaAtivo ? 'ATIVO (MENOR PREÇO GERAL)' : 'EAN EXATO'}
                  </button>
                </div>
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

            {/* ─── PAINEL DE ADAPTAÇÃO AO ORÇAMENTO SEMANAL DISPONÍVEL ─────────── */}
            <div className="bg-gradient-to-r from-[#0c1c36] via-[#0e2242] to-[#0a162b] p-3.5 rounded-2xl border-2 border-cyan-500/60 shadow-xl flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 shadow-md shrink-0">
                  <Wallet className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-cyan-300">
                      Quanto você quer gastar nesta semana?
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-950 text-cyan-200 border border-cyan-700">
                      ADAPTAÇÃO AUTOMÁTICA
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">
                    O BelaPed seleciona os produtos mais críticos (<b>P1</b> e <b>P2</b>) até atingir exatamente o seu teto, mantendo a lista equalizada.
                  </p>
                </div>
              </div>

              {/* Controles do Campo de Valor e Botão de Ação */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Input de Valor em Moeda */}
                <div className="flex items-center bg-[#071120] border-2 border-cyan-500/80 rounded-xl px-3 py-1.5 shadow-inner">
                  <span className="text-xs font-black text-cyan-400 mr-1.5">R$</span>
                  <input
                    type="number"
                    step="100"
                    min="100"
                    value={valorOrcamentoSemanal}
                    onChange={(e) => setValorOrcamentoSemanal(Math.max(0, Number(e.target.value) || 0))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAdaptarListaAoOrcamento();
                    }}
                    className="w-28 bg-transparent text-sm font-black text-white focus:outline-none"
                    placeholder="5000"
                    title="Digite o valor em Reais que você deseja gastar nesta semana"
                  />
                </div>

                {/* Botões Rápidos de Orçamento */}
                <div className="flex items-center bg-[#071120] p-1 rounded-xl border border-slate-700 text-xs font-bold gap-1">
                  {[3000, 5000, 7500, 10000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setValorOrcamentoSemanal(v);
                        handleAdaptarListaAoOrcamento(v);
                      }}
                      className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                        valorOrcamentoSemanal === v
                          ? 'bg-cyan-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      R$ {(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k
                    </button>
                  ))}
                </div>

                {/* Botão de Disparo da Adaptação */}
                <button
                  type="button"
                  onClick={() => handleAdaptarListaAoOrcamento()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:brightness-110 text-white text-xs font-black shadow-lg shadow-emerald-950/60 transition-all cursor-pointer active:scale-95 border border-emerald-400/50"
                  title="Seleciona automaticamente os produtos com maior criticidade de falta até atingir o limite digitado"
                >
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>🎯 Adaptar Lista ao Orçamento</span>
                </button>

                {/* Indicador de Uso do Orçamento */}
                <div className="px-3 py-1.5 rounded-xl bg-[#071120] border border-slate-700 text-right text-xs shrink-0">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Alocado na Seleção</span>
                  <span className="text-xs font-black text-emerald-400">
                    R$ {totaisSelecionados.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    <span className="text-slate-400 font-normal ml-1">
                      ({valorOrcamentoSemanal > 0 ? Math.round((totaisSelecionados.valorTotal / valorOrcamentoSemanal) * 100) : 0}%)
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Controles Limpos: Busca no Estoque Real + Filtros + Ações Unificadas */}
            <div className="bg-[#0e1626] p-3 sm:p-3.5 rounded-2xl border border-slate-800 shadow-md space-y-3">
              {/* LINHA 1: BARRA SUPERIOR DE BUSCA E AÇÕES PRINCIPAIS */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Lado Esquerdo: Campo de Busca Rápida + Botão Modal Estoque Real */}
                <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
                  <div className="relative w-full sm:w-72 lg:w-80">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                    <input
                      type="text"
                      placeholder="Buscar produto ou EAN (Enter p/ Modal)..."
                      value={buscaFalta}
                      onChange={(e) => setBuscaFalta(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && buscaFalta.trim().length >= 2) {
                          setModalEstoqueRealAberto(true);
                        }
                      }}
                      className="w-full pl-9 pr-8 py-2 text-xs font-semibold rounded-xl border border-cyan-800/70 bg-[#080d18] text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    {buscaFalta && (
                      <button
                        type="button"
                        onClick={() => setBuscaFalta('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                        title="Limpar busca"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalEstoqueRealAberto(true)}
                    className="px-3 py-2 rounded-xl bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-600/80 text-xs font-black whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 shadow-sm transition-all shrink-0"
                    title="Abrir Modal ampla de Pesquisa no Estoque Real da Farmácia com justificativa detalhada e letras grandes"
                  >
                    <Search className="w-3.5 h-3.5 text-cyan-400" />
                    <span>📦 Estoque Real {buscaFalta.trim().length >= 2 ? `(${resultadosEstoqueReal.length})` : ''}</span>
                  </button>
                </div>

                {/* Lado Direito: Ações Principais e de Apoio Alinhadas Horizontalmente */}
                <div className="flex items-center gap-2 flex-wrap lg:justify-end">
                  {/* BOTÃO: RE-COTAR DIVERGENTES (>40% OU >60% VS ÚLTIMA COMPRA) */}
                  {itensDivergentes.length > 0 && (
                    <button
                      onClick={() => {
                        const eansDivergentes = Array.from(new Set(itensDivergentes.map(i => i.ean).filter(Boolean)));
                        handleIniciarCotacaoAoVivo('TODOS', eansDivergentes.length, undefined, eansDivergentes);
                      }}
                      disabled={cotandoAoVivo}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/90 hover:bg-rose-900 text-rose-200 border border-rose-600 text-xs font-black shadow-md transition-all cursor-pointer animate-pulse whitespace-nowrap"
                      title={`${itensDivergentes.length} itens têm cotação do 1º colocado muito distante da última compra. Clique para rodar o robô novamente neles.`}
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                      <span>Divergentes ({itensDivergentes.length})</span>
                    </button>
                  )}

                  {/* BOTÃO PRINCIPAL: RECARREGAR COTAÇÃO (ROBÔS AO VIVO NOS 9 PORTAIS) */}
                  <button
                    onClick={() => handleIniciarCotacaoAoVivo('TODOS')}
                    disabled={cotandoAoVivo}
                    className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-black shadow-lg shadow-emerald-950/50 transition-all cursor-pointer disabled:opacity-50 active:scale-95 whitespace-nowrap"
                    title="Disparar os robôs agora para consultar preços ao vivo nos 9 portais (Profarma, DPC, Soton Farma, Distrimed, Divimed, Martins Atacado, Oriente Farma, Panpharma e MG Medicamentos)"
                  >
                    {cotandoAoVivo ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Cotando nos 9 Portais ({statusCotacao?.atual || 0}/{statusCotacao?.total || 0})...</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-4 h-4 text-emerald-200" />
                        <span>Cotar 9 Portais (Robôs)</span>
                      </>
                    )}
                  </button>

                  {/* BOTÃO: REINICIAR COTAÇÃO (INTERROMPE, DESTRAVA E RECOMEÇA A COTAÇÃO) */}
                  <button
                    onClick={handleReiniciarCotacao}
                    disabled={reiniciandoCotacao}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-950/80 hover:bg-amber-900/90 text-amber-200 border border-amber-600/70 text-xs font-black shadow-md transition-all cursor-pointer disabled:opacity-50 active:scale-95 whitespace-nowrap"
                    title="Reiniciar a cotação: interrompe e destrava qualquer robô ou processo anterior e reinicia uma nova cotação limpa nos 9 portais"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 text-amber-400 ${reiniciandoCotacao ? 'animate-spin' : ''}`} />
                    <span>{reiniciandoCotacao ? 'Reiniciando...' : 'Reiniciar Cotação'}</span>
                  </button>

                  {/* BOTÃO: OTIMIZAR CARRINHOS (DISSOLVE EMPRESAS ABAIXO DO MÍNIMO E REPASSA PRODUTOS) */}
                  <button
                    onClick={() => handleExecutarSimulacao(true)}
                    disabled={simulando || totaisSelecionados.qtdItens === 0}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black shadow-lg shadow-cyan-900/30 transition-all cursor-pointer disabled:opacity-50 active:scale-95 whitespace-nowrap"
                    title="Pega os carrinhos das empresas que não atingiram o pedido mínimo, divide os produtos com as outras empresas cotadas e abre os carrinhos otimizados"
                  >
                    <Sparkles className={`w-4 h-4 text-cyan-200 ${simulando ? 'animate-spin' : ''}`} />
                    <span>{simulando ? 'Otimizando...' : `✨ Otimizar (${totaisSelecionados.qtdItens})`}</span>
                  </button>

                  {/* BOTÃO: VER CARRINHOS (ABRE MODAL UNIFICADA COM GUIAS DE CADA EMPRESA) */}
                  <button
                    onClick={() => handleAbrirModalVerCarrinhos()}
                    disabled={simulando}
                    className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-black shadow-lg shadow-indigo-950/50 border border-indigo-400/50 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                    title="Abrir a modal unificada com guias (abas) de cada empresa cotada para ver/montar carrinhos, excluir itens, passar para o 2º colocado e confirmar compra"
                  >
                    <ShoppingCart className="w-4 h-4 text-indigo-200" />
                    <span>🛒 Ver Carrinhos ({carrinhosOtimizados.length > 0 ? `${carrinhosOtimizados.length} emp.` : `${totaisPorDistribuidora.filter(g => g.isEmpresaReal).length} emp.`})</span>
                  </button>

                  {/* BOTÃO: ESPAÇO DE PRODUTOS DESEJADOS */}
                  <button
                    onClick={() => setModalDesejadosAberto(true)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-black shadow-lg shadow-amber-950/50 border border-amber-400/50 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                    title="Espaço de Produtos Desejados: lista de produtos gravados para cotação prioritária nos 9 portais e compra"
                  >
                    <Tag className="w-3.5 h-3.5 text-amber-200" />
                    <span>⭐ Desejados ({itensAvulsos.length})</span>
                  </button>

                  {/* Botões de Apoio Compactos */}
                  <button
                    onClick={() => setModalAuditoriaAberta(true)}
                    disabled={auditandoPrazos}
                    className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#091528] hover:bg-indigo-950 text-indigo-200 border border-indigo-800/70 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                    title="Ver e auditar prazos de boletos e pedidos mínimos dos 9 portais"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                    <span>💳 Prazos</span>
                  </button>

                  <button
                    onClick={() => setModalCampanhasAberta(true)}
                    className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#091528] hover:bg-amber-950/60 text-amber-300 border border-amber-800/60 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                    title="Gerenciar campanhas comerciais da Distrimed"
                  >
                    <Tag className="w-3.5 h-3.5 text-amber-400" />
                    <span>🏷️ Campanhas</span>
                  </button>

                  {ultimoRelatorioAuditoria && (
                    <button
                      onClick={() => setModalRelatorioAberto(true)}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                      title={`Relatório do robô (${ultimoRelatorioAuditoria.distribuidora})`}
                    >
                      <ClipboardList className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Relatório Robô</span>
                    </button>
                  )}
                </div>
              </div>

              {/* LINHA 2: BARRA DEDICADA DE FILTROS E SEGMENTAÇÃO DE FALTAS */}
              <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2.5 flex-wrap">
                {/* Lado Esquerdo: Ranking + Curva ABC + Esquecidos */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Botão Ordenar por Rankeamento (#1 Alto Giro + Risco de Ruptura) */}
                  <button
                    type="button"
                    onClick={() => {
                      setOrdenarColuna('ranking_posicao');
                      setOrdenarDirecao('asc');
                      setPaginaAtual(1);
                    }}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer whitespace-nowrap ${
                      ordenarColuna === 'ranking_posicao' || !ordenarColuna
                        ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white border-amber-400 shadow-sm'
                        : 'bg-[#080d18] text-amber-300 border-slate-700 hover:border-amber-500'
                    }`}
                    title="Ordenar pelo Sistema de Rankeamento (#1, #2, #3...): primeiras posições para produtos de Alto Giro e Risco de Ruptura"
                  >
                    <span>🔥 Ranking Giro/Ruptura</span>
                  </button>

                  {/* Filtro Curva ABC + Esquecidos 6 Meses */}
                  <div className="shrink-0 flex items-center rounded-xl border border-slate-700 p-0.5 bg-[#080d18] text-xs font-bold whitespace-nowrap">
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
                    <button
                      onClick={() => setFiltroCurva('DESEJADOS')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${filtroCurva === 'DESEJADOS' ? 'bg-amber-500 text-slate-950 shadow-xs font-black' : 'text-amber-300 hover:text-white'}`}
                      title="Exibir somente os Produtos Desejados gravados para cotação prioritária e compra"
                    >
                      ⭐ Desejados ({faltas.filter(f => f.is_desejado).length || itensAvulsos.length})
                    </button>
                  </div>
                </div>

                {/* Lado Direito: Categoria + Matriz de Prioridade */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Filtro Tipo Categoria */}
                  <div className="shrink-0 flex items-center rounded-xl border border-slate-700 p-0.5 bg-[#080d18] text-xs font-bold whitespace-nowrap">
                    <button
                      onClick={() => setFiltroCategoria('TODAS')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${filtroCategoria === 'TODAS' ? 'bg-cyan-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setFiltroCategoria('MEDICAMENTO')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${filtroCategoria === 'MEDICAMENTO' ? 'bg-emerald-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                    >
                      Med
                    </button>
                    <button
                      onClick={() => setFiltroCategoria('PERFUMARIA')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${filtroCategoria === 'PERFUMARIA' ? 'bg-purple-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                    >
                      Perf
                    </button>
                  </div>

                  {/* Filtro Matriz de Prioridade da Cotação (P1, P2, P3, P4) */}
                  <div className="shrink-0 flex items-center rounded-xl border border-slate-700 p-0.5 bg-[#080d18] text-xs font-bold whitespace-nowrap">
                    <button
                      onClick={() => setFiltroPrioridade('TODAS')}
                      className={`px-2 py-1 rounded-lg transition-all ${filtroPrioridade === 'TODAS' ? 'bg-cyan-600 text-white font-black' : 'text-slate-400 hover:text-white'}`}
                    >
                      Prio
                    </button>
                    <button
                      onClick={() => setFiltroPrioridade('P1')}
                      className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${filtroPrioridade === 'P1' ? 'bg-rose-600 text-white font-black shadow-xs' : 'text-rose-400 hover:text-rose-200'}`}
                      title="🚨 P1: Ruptura Crítica (Estoque Zerado + Curva A ou B)"
                    >
                      <span>🚨 P1</span>
                      <span className="text-[10px] opacity-80">({faltas.filter(f => f.prioridade === 'P1').length})</span>
                    </button>
                    <button
                      onClick={() => setFiltroPrioridade('P2')}
                      className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${filtroPrioridade === 'P2' ? 'bg-amber-600 text-white font-black shadow-xs' : 'text-amber-400 hover:text-amber-200'}`}
                      title="⚠️ P2: Risco Iminente (< 3 dias de giro + Curva A/B)"
                    >
                      <span>⚠️ P2</span>
                      <span className="text-[10px] opacity-80">({faltas.filter(f => f.prioridade === 'P2').length})</span>
                    </button>
                    <button
                      onClick={() => setFiltroPrioridade('P3')}
                      className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${filtroPrioridade === 'P3' ? 'bg-blue-600 text-white font-black shadow-xs' : 'text-blue-400 hover:text-blue-200'}`}
                      title="💼 P3: Orçamento Semanal (Mix preventivo dentro do teto)"
                    >
                      <span>💼 P3</span>
                      <span className="text-[10px] opacity-80">({faltas.filter(f => f.prioridade === 'P3').length})</span>
                    </button>
                    <button
                      onClick={() => setFiltroPrioridade('P4')}
                      className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${filtroPrioridade === 'P4' ? 'bg-slate-700 text-white font-black shadow-xs' : 'text-slate-400 hover:text-slate-200'}`}
                      title="📦 P4: Regular (Curva C / baixo giro - modo ocioso)"
                    >
                      <span>📦 P4</span>
                      <span className="text-[10px] opacity-80">({faltas.filter(f => f.prioridade === 'P4').length})</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ─── BARRA DE ACESSO RÁPIDO À MODAL DO ESTOQUE REAL (QUANDO PESQUISANDO) ─── */}
              {buscaFalta.trim().length >= 2 && (
                <div className="pt-2.5 border-t border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="px-2.5 py-1 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-600 text-xs font-black uppercase tracking-wider">
                      📦 Estoque Real da Farmácia
                    </span>
                    {buscandoEstoqueReal ? (
                      <span className="text-sm text-cyan-300 font-bold flex items-center gap-1.5">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Consultando estoque real para "{buscaFalta.trim()}"...
                      </span>
                    ) : resultadosEstoqueReal.length === 0 ? (
                      <span className="text-sm text-slate-300 font-semibold">
                        Nenhum produto localizado no cadastro do estoque real para <b className="text-white">"{buscaFalta.trim()}"</b>.
                      </span>
                    ) : (
                      <span className="text-sm text-slate-200 font-semibold">
                        Localizado(s) <b className="text-cyan-300 font-black">{resultadosEstoqueReal.length} produto(s)</b> no estoque real para <b className="text-white">"{buscaFalta.trim()}"</b> — clique ao lado para ler a justificativa completa.
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setModalEstoqueRealAberto(true)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-cyan-600 hover:from-amber-500 hover:to-cyan-500 text-white text-xs sm:text-sm font-black shadow-lg transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap"
                  >
                    <Maximize2 className="w-4 h-4" />
                    <span>Abrir Resultado & Justificativa em Modal ({resultadosEstoqueReal.length})</span>
                  </button>
                </div>
              )}

              {/* ─── MODAL AMPLA DE PESQUISA NO ESTOQUE REAL COM DESEMPENHO COMPLETO & GRAVAÇÃO EM LOTE ─── */}
              {modalEstoqueRealAberto && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-[#0b1320] border-2 border-cyan-600/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden ring-2 ring-cyan-500/20">
                    {/* Header da Modal com Barra de Pesquisa Grande */}
                    <div className="p-4 sm:p-5 border-b border-slate-800 bg-[#070e1a] space-y-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-500/80 text-cyan-300">
                            <Search className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-lg sm:text-xl font-black uppercase text-white tracking-wide flex items-center gap-2">
                              <span>📦 Consulta no Estoque Real & Histórico de Desempenho</span>
                              {resumoPesquisaEstoqueReal && (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-cyan-950 text-cyan-300 border border-cyan-600">
                                  {resumoPesquisaEstoqueReal.total_encontrados} encontrados
                                </span>
                              )}
                            </h3>
                            <p className="text-xs sm:text-sm text-slate-300">
                              Pesquise qualquer palavra-chave (ex: 'maxton') para ver todo o catálogo, vendas dos últimos 10 meses e gravar nos <b>⭐ Produtos Desejados</b>.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setModalEstoqueRealAberto(false)}
                          className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition-colors"
                          title="Fechar modal"
                        >
                          <X className="w-6 h-6" />
                        </button>
                      </div>

                      {/* Campo de busca amplo dentro da própria modal */}
                      <div className="relative">
                        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400" />
                        <input
                          type="text"
                          autoFocus
                          placeholder="Digite qualquer palavra-chave (ex: maxton, tinta, dipirona) ou bipe o EAN..."
                          value={buscaFalta}
                          onChange={(e) => setBuscaFalta(e.target.value)}
                          className="w-full pl-12 pr-12 py-3 text-base sm:text-lg font-bold rounded-xl border-2 border-cyan-600/80 bg-[#050a14] text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 shadow-inner"
                        />
                        {buscaFalta && (
                          <button
                            type="button"
                            onClick={() => setBuscaFalta('')}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold cursor-pointer"
                          >
                            Limpar
                          </button>
                        )}
                      </div>

                      {/* Resumo Consolidado da Palavra-Chave (Total, Com Vendas 10m, Com Estoque, Soma de Unidades) */}
                      {resumoPesquisaEstoqueReal && resumoPesquisaEstoqueReal.total_encontrados > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 bg-[#050d18] p-2.5 rounded-xl border border-cyan-900/60 text-xs">
                          <div className="bg-[#081326] p-2 rounded-lg border border-slate-800">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Encontrados</span>
                            <span className="text-sm font-black text-white">{resumoPesquisaEstoqueReal.total_encontrados} produtos</span>
                          </div>
                          <div className="bg-[#081326] p-2 rounded-lg border border-slate-800">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Com Vendas 10m</span>
                            <span className="text-sm font-black text-emerald-400">{resumoPesquisaEstoqueReal.com_vendas_historico} produtos</span>
                          </div>
                          <div className="bg-[#081326] p-2 rounded-lg border border-slate-800">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Com Estoque</span>
                            <span className="text-sm font-black text-cyan-400">{resumoPesquisaEstoqueReal.com_estoque} produtos</span>
                          </div>
                          <div className="bg-[#081326] p-2 rounded-lg border border-slate-800">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Zerados c/ Giro</span>
                            <span className="text-sm font-black text-rose-400">{resumoPesquisaEstoqueReal.zerados_com_giro} produtos</span>
                          </div>
                          <div className="bg-[#081326] p-2 rounded-lg border border-slate-800">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Vendido 10m</span>
                            <span className="text-sm font-black text-amber-300">{resumoPesquisaEstoqueReal.soma_vendas_10m} un</span>
                          </div>
                          <div className="bg-[#081326] p-2 rounded-lg border border-slate-800">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Estoque Físico Total</span>
                            <span className="text-sm font-black text-slate-200">{resumoPesquisaEstoqueReal.soma_estoque_atual} un</span>
                          </div>
                        </div>
                      )}

                      {/* Filtros Rápidos Dentro da Modal + Barra de Ação em Lote */}
                      {resultadosEstoqueReal.length > 0 && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                            <button
                              type="button"
                              onClick={() => setFiltroModalEstoque('TODOS')}
                              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                                filtroModalEstoque === 'TODOS' ? 'bg-cyan-600 text-white font-black shadow-sm' : 'bg-slate-900 text-slate-400 hover:text-white'
                              }`}
                            >
                              Todos ({resultadosEstoqueReal.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setFiltroModalEstoque('COM_VENDAS')}
                              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                                filtroModalEstoque === 'COM_VENDAS' ? 'bg-emerald-600 text-white font-black shadow-sm' : 'bg-slate-900 text-emerald-400 hover:text-white'
                              }`}
                            >
                              🔥 Com Vendas 10m ({resultadosEstoqueReal.filter(p => (Number(p.vendas_10m) || 0) > 0).length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setFiltroModalEstoque('COM_ESTOQUE')}
                              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                                filtroModalEstoque === 'COM_ESTOQUE' ? 'bg-blue-600 text-white font-black shadow-sm' : 'bg-slate-900 text-blue-400 hover:text-white'
                              }`}
                            >
                              📦 Com Estoque ({resultadosEstoqueReal.filter(p => Number(p.saldo) > 0).length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setFiltroModalEstoque('ZERADOS_GIRO')}
                              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                                filtroModalEstoque === 'ZERADOS_GIRO' ? 'bg-rose-600 text-white font-black shadow-sm' : 'bg-slate-900 text-rose-400 hover:text-white'
                              }`}
                            >
                              🚨 Zerados c/ Giro ({resultadosEstoqueReal.filter(p => Number(p.saldo) <= 0 && (Number(p.vendas_10m) || 0) > 0).length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setFiltroModalEstoque('SEM_GIRO')}
                              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                                filtroModalEstoque === 'SEM_GIRO' ? 'bg-slate-700 text-white font-black shadow-sm' : 'bg-slate-900 text-slate-400 hover:text-white'
                              }`}
                            >
                              ❄️ Sem Vendas / Zerados ({resultadosEstoqueReal.filter(p => Number(p.saldo) <= 0 && (Number(p.vendas_10m) || 0) === 0).length})
                            </button>
                          </div>

                          {/* Ações em Lote */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const visiveis = resultadosEstoqueReal.filter(p => {
                                  if (filtroModalEstoque === 'COM_VENDAS') return (Number(p.vendas_10m) || 0) > 0;
                                  if (filtroModalEstoque === 'COM_ESTOQUE') return Number(p.saldo) > 0;
                                  if (filtroModalEstoque === 'ZERADOS_GIRO') return Number(p.saldo) <= 0 && (Number(p.vendas_10m) || 0) > 0;
                                  if (filtroModalEstoque === 'SEM_GIRO') return Number(p.saldo) <= 0 && (Number(p.vendas_10m) || 0) === 0;
                                  return true;
                                });
                                const todosMarcados = visiveis.every(p => selecaoModalEstoque[p.produto_id]);
                                const novaSel = { ...selecaoModalEstoque };
                                visiveis.forEach(p => {
                                  novaSel[p.produto_id] = !todosMarcados;
                                });
                                setSelecaoModalEstoque(novaSel);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold cursor-pointer"
                            >
                              Selecionar Visíveis
                            </button>

                            {Object.values(selecaoModalEstoque).filter(Boolean).length > 0 && (
                              <button
                                type="button"
                                onClick={handleGravarDesejadosLote}
                                disabled={salvandoDesejadosLote}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-black shadow-lg transition-all cursor-pointer animate-pulse"
                              >
                                <span>⭐ Gravar {Object.values(selecaoModalEstoque).filter(Boolean).length} nos Desejados</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Corpo da Modal com Cards Amplos e Letras Grandes */}
                    <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
                      {buscaFalta.trim().length < 2 ? (
                        <div className="py-12 text-center text-slate-400 text-base font-medium">
                          Digite pelo menos 2 caracteres ou uma palavra-chave como <b>"maxton"</b> acima para consultar todo o histórico.
                        </div>
                      ) : buscandoEstoqueReal ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-3 text-cyan-300 text-base font-bold">
                          <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                          <span>Consultando o catálogo completo do estoque real e histórico de vendas...</span>
                        </div>
                      ) : resultadosEstoqueReal.length === 0 ? (
                        <div className="p-6 rounded-2xl bg-[#080d18] border border-slate-700 text-center space-y-2">
                          <p className="text-base sm:text-lg font-black text-white">
                            Nenhum produto encontrado no cadastro do estoque real para "{buscaFalta.trim()}".
                          </p>
                          <p className="text-sm text-slate-400">
                            Verifique se a palavra-chave ou o código de barras (EAN) foi digitado corretamente.
                          </p>
                        </div>
                      ) : (
                        resultadosEstoqueReal
                          .filter(prod => {
                            if (filtroModalEstoque === 'COM_VENDAS') return (Number(prod.vendas_10m) || 0) > 0;
                            if (filtroModalEstoque === 'COM_ESTOQUE') return Number(prod.saldo) > 0;
                            if (filtroModalEstoque === 'ZERADOS_GIRO') return Number(prod.saldo) <= 0 && (Number(prod.vendas_10m) || 0) > 0;
                            if (filtroModalEstoque === 'SEM_GIRO') return Number(prod.saldo) <= 0 && (Number(prod.vendas_10m) || 0) === 0;
                            return true;
                          })
                          .map((prod) => {
                            const jaDesejado = Boolean(prod.is_desejado);
                            const jaNaListaAtiva = Boolean(
                              jaDesejado ||
                              prod.ja_na_cotacao ||
                              faltas.some(f => f.produto_id === prod.produto_id || (f.ean && prod.ean && f.ean === prod.ean))
                            );
                            const isMarcadoLote = Boolean(selecaoModalEstoque[prod.produto_id]);

                            return (
                              <div
                                key={prod.produto_id}
                                className={`p-4 sm:p-5 rounded-2xl border-2 flex flex-col gap-3.5 transition-all shadow-lg ${
                                  jaDesejado
                                    ? 'bg-[#1a1205] border-amber-500 ring-2 ring-amber-500/20'
                                    : jaNaListaAtiva
                                    ? 'bg-emerald-950/25 border-emerald-500/70'
                                    : 'bg-[#081121] border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                {/* Topo: Checkbox + Título + Badges */}
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                  <div className="flex items-start gap-3">
                                    <input
                                      type="checkbox"
                                      checked={isMarcadoLote}
                                      onChange={() => setSelecaoModalEstoque(prev => ({ ...prev, [prod.produto_id]: !prev[prod.produto_id] }))}
                                      className="w-5 h-5 mt-1 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 cursor-pointer shrink-0"
                                      title="Selecionar para gravação em lote nos Produtos Desejados"
                                    />
                                    <div className="space-y-1">
                                      <h4 className="text-base sm:text-lg font-black text-white leading-snug flex items-center gap-2 flex-wrap">
                                        <span>{prod.descricao}</span>
                                        {jaDesejado && (
                                          <span className="px-2 py-0.5 rounded text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-400">
                                            ⭐ PRODUTO DESEJADO
                                          </span>
                                        )}
                                      </h4>
                                      <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 border border-slate-700 font-mono font-bold text-cyan-300">
                                          EAN: {prod.ean || 'SEM EAN'}
                                        </span>
                                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 border border-slate-700 font-bold text-slate-300">
                                          Curva {prod.curva_abc}
                                        </span>
                                        <span className={`px-2.5 py-0.5 rounded-lg font-black border ${
                                          prod.saldo <= 0
                                            ? 'bg-rose-950/80 border-rose-600 text-rose-300'
                                            : 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                                        }`}>
                                          Estoque: {prod.saldo} un
                                        </span>
                                        {prod.preco_ult_compra > 0 && (
                                          <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300">
                                            Últ. Custo: <b className="text-amber-300 font-black">R$ {Number(prod.preco_ult_compra).toFixed(2)}</b>
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 self-start">
                                    {jaDesejado ? (
                                      <span className="px-3 py-1 rounded-xl bg-amber-950 text-amber-300 border border-amber-500 text-xs font-black whitespace-nowrap">
                                        ⭐ NA FILA P1 (DESEJADO)
                                      </span>
                                    ) : jaNaListaAtiva ? (
                                      <span className="px-3 py-1 rounded-xl bg-emerald-950 text-emerald-300 border border-emerald-500 text-xs font-black whitespace-nowrap">
                                        ✅ NA COTAÇÃO AUTOMÁTICA
                                      </span>
                                    ) : (
                                      <span className="px-3 py-1 rounded-xl bg-slate-900 text-slate-400 border border-slate-700 text-xs font-bold whitespace-nowrap">
                                        FORA DA COTAÇÃO
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Grade Completa de Desempenho Histórico de Vendas (30d, 60d, 90d, 10 Meses, Entradas) */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 bg-[#050b14] p-3 rounded-xl border border-slate-800 text-center">
                                  <div className="bg-[#081224] p-2 rounded-lg border border-slate-800">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Vendas 30d</span>
                                    <span className="text-sm font-black text-cyan-300">{prod.vendas_30d || 0} un</span>
                                  </div>
                                  <div className="bg-[#081224] p-2 rounded-lg border border-slate-800">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">31 a 60d</span>
                                    <span className="text-sm font-black text-slate-300">{prod.vendas_31_60d || 0} un</span>
                                  </div>
                                  <div className="bg-[#081224] p-2 rounded-lg border border-slate-800">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">61 a 90d</span>
                                    <span className="text-sm font-black text-slate-300">{prod.vendas_61_90d || 0} un</span>
                                  </div>
                                  <div className="bg-[#081224] p-2 rounded-lg border border-emerald-700/60 bg-emerald-950/20">
                                    <span className="text-[10px] text-emerald-300 uppercase font-black block">Total 10 Meses</span>
                                    <span className="text-sm font-black text-emerald-400">{prod.vendas_10m || 0} un</span>
                                  </div>
                                  <div className="bg-[#081224] p-2 rounded-lg border border-slate-800">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Entradas 10m</span>
                                    <span className="text-sm font-black text-purple-300">{prod.entradas_10m || 0} un</span>
                                  </div>
                                  <div className="bg-[#081224] p-2 rounded-lg border border-slate-800">
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Cobertura</span>
                                    <span className={`text-sm font-black ${prod.dias_cobertura <= 0 ? 'text-rose-400' : 'text-amber-300'}`}>
                                      {prod.dias_cobertura >= 999 ? 'Sem giro' : `~${prod.dias_cobertura}d`}
                                    </span>
                                  </div>
                                </div>

                                {/* Preço Cotado Atual nos Portais (se já houver cotação recente) */}
                                {(prod.fornecedor_1 && prod.preco_1 > 0) && (
                                  <div className="flex items-center gap-3 bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-600/50 text-xs font-bold text-emerald-200">
                                    <span>💰 Cotação Atual nos Portais:</span>
                                    <span className="text-white">1º: <b className="text-emerald-300">{prod.fornecedor_1}</b> (R$ {Number(prod.preco_1).toFixed(2)})</span>
                                    {prod.fornecedor_2 && (
                                      <span className="text-slate-300">2º: <b>{prod.fornecedor_2}</b> (R$ {Number(prod.preco_2).toFixed(2)})</span>
                                    )}
                                  </div>
                                )}

                                {/* Caixa de Justificativa com Alta Legibilidade */}
                                <div className={`p-3.5 rounded-xl border leading-relaxed ${
                                  jaDesejado
                                    ? 'bg-amber-950/40 border-amber-600/70 text-amber-100'
                                    : jaNaListaAtiva
                                    ? 'bg-emerald-950/40 border-emerald-600/70 text-emerald-100'
                                    : 'bg-[#060e1c] border-slate-700/80 text-slate-200'
                                }`}>
                                  <div className="text-[11px] font-black uppercase tracking-wider mb-1 text-amber-300 flex items-center gap-1.5">
                                    <span>💡 JUSTIFICATIVA DO SISTEMA:</span>
                                  </div>
                                  <p className="text-sm sm:text-base font-bold leading-snug">
                                    "{prod.justificativa_compra}"
                                  </p>
                                </div>

                                {/* Ações do Produto: Gravar nos Desejados ou Remover */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs sm:text-sm font-bold text-slate-300">
                                      Quantidade para compra:
                                    </span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={999}
                                      value={qtdIncluirEstoque[prod.produto_id] ?? prod.qtd_sugerida ?? 2}
                                      onChange={(e) => setQtdIncluirEstoque(prev => ({ ...prev, [prod.produto_id]: Math.max(1, Number(e.target.value) || 1) }))}
                                      className="w-20 px-3 py-1.5 rounded-xl bg-slate-900 border-2 border-cyan-600 text-white text-sm font-black text-center"
                                    />
                                    <span className="text-xs font-bold text-slate-400">un</span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {jaDesejado ? (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoverDesejado(prod.id_desejado, prod.descricao)}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-600 text-xs sm:text-sm font-black cursor-pointer transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                        <span>Remover dos Desejados</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleGravarProdutoDesejado(prod)}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white text-xs sm:text-sm font-black transition-all cursor-pointer shadow-lg active:scale-95"
                                      >
                                        <span>⭐ Gravar nos Produtos Desejados</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>

                    {/* Footer da Modal */}
                    <div className="p-4 border-t border-slate-800 bg-[#070e1a] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400">
                        <span>Produtos gravados em <b>⭐ Produtos Desejados</b> entram na fila prioritária P1 dos 7 robôs.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setModalEstoqueRealAberto(false);
                            setModalDesejadosAberto(true);
                          }}
                          className="px-4 py-2.5 rounded-xl bg-amber-950 hover:bg-amber-900 text-amber-200 border border-amber-600 text-xs sm:text-sm font-black transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <span>⭐ Ver Produtos Desejados ({itensAvulsos.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalEstoqueRealAberto(false)}
                          className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-black transition-colors cursor-pointer"
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── MODAL DEDICADA: ESPAÇO DE PRODUTOS DESEJADOS ─── */}
              {modalDesejadosAberto && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-[#0d1422] border-2 border-amber-500/80 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden ring-2 ring-amber-500/20">
                    {/* Header */}
                    <div className="p-4 sm:p-5 border-b border-slate-800 bg-[#070d18] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-amber-950 border border-amber-500/80 text-amber-300">
                          <Tag className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-lg sm:text-xl font-black uppercase text-white tracking-wide flex items-center gap-2">
                            <span>⭐ Espaço de Produtos Desejados ({itensAvulsos.length})</span>
                          </h3>
                          <p className="text-xs sm:text-sm text-slate-300">
                            Estes produtos entram automaticamente na cotação ao vivo dos 7 robôs com prioridade máxima (<b>P1</b>) e permanecem na lista até a confirmação da compra.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalDesejadosAberto(false)}
                        className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition-colors"
                      >
                        <X className="w-6 h-6" />
                      </button>
                    </div>

                    {/* Toolbar de Ações dos Desejados */}
                    <div className="p-3.5 bg-[#0a1120] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setModalDesejadosAberto(false);
                            setModalEstoqueRealAberto(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-600 text-xs sm:text-sm font-black cursor-pointer transition-all shadow-sm"
                        >
                          <Search className="w-4 h-4 text-cyan-300" />
                          <span>+ Pesquisar e Adicionar Produtos</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const eansDesejados = itensAvulsos.map(i => i.ean).filter(e => e && String(e).trim().length >= 7);
                            if (eansDesejados.length === 0) {
                              addToast('Nenhum EAN válido cadastrado nos produtos desejados.', 'warning');
                              return;
                            }
                            handleIniciarCotacaoAoVivo('TODOS', eansDesejados.length, undefined, eansDesejados);
                            setModalDesejadosAberto(false);
                          }}
                          disabled={cotandoAoVivo || itensAvulsos.length === 0}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs sm:text-sm font-black shadow-md transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Bot className="w-4 h-4 text-emerald-200" />
                          <span>🤖 Cotar Desejados nos 9 Portais ({itensAvulsos.length})</span>
                        </button>
                      </div>
                    </div>

                    {/* Lista dos Produtos Desejados */}
                    <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
                      {itensAvulsos.length === 0 ? (
                        <div className="py-16 text-center space-y-3">
                          <p className="text-base sm:text-lg font-black text-white">
                            Você ainda não tem nenhum produto salvo nos Produtos Desejados.
                          </p>
                          <p className="text-sm text-slate-400 max-w-md mx-auto">
                            Pesquise qualquer produto no Estoque Real (ex: 'maxton') e clique em <b>⭐ Gravar nos Desejados</b> para incluí-lo na cotação prioritária dos robôs.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setModalDesejadosAberto(false);
                              setModalEstoqueRealAberto(true);
                            }}
                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-black cursor-pointer shadow-lg"
                          >
                            Pesquisar Estoque Real Agora
                          </button>
                        </div>
                      ) : (
                        itensAvulsos.map((av) => (
                          <div
                            key={av.id}
                            className="p-4 rounded-xl bg-[#091122] border border-amber-600/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md hover:border-amber-500 transition-colors"
                          >
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-base font-black text-white">{av.descricao}</h4>
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-400">
                                  ⭐ DESEJADO
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-cyan-300">
                                  EAN: {av.ean || 'SEM EAN'}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                                  Estoque: <b className="text-white">{av.saldo_atual || 0} un</b>
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                                  Vendas 30d: <b className="text-white">{av.vendas_30d || 0} un</b>
                                </span>
                                {(av.fornecedor_1 && Number(av.preco_1) > 0) ? (
                                  <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-600 text-emerald-300 font-bold">
                                    Melhor Preço: {av.fornecedor_1} (R$ {Number(av.preco_1).toFixed(2)})
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500">
                                    Aguardando Cotação dos Robôs
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-400 font-bold">Qtd:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={999}
                                  defaultValue={av.quantidade || 1}
                                  onBlur={(e) => {
                                    const val = Math.max(1, Number(e.target.value) || 1);
                                    if (val !== av.quantidade) {
                                      handleAtualizarQtdDesejado(av.id, val);
                                    }
                                  }}
                                  className="w-16 px-2 py-1 rounded-lg bg-slate-900 border border-amber-500 text-white text-sm font-black text-center"
                                />
                                <span className="text-xs text-slate-400">un</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoverDesejado(av.id, av.descricao)}
                                className="p-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-700 cursor-pointer transition-colors"
                                title="Remover da lista de desejados"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-800 bg-[#070d18] flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        Quando você confirma a compra do carrinho, os produtos desejados comprados saem automaticamente desta lista.
                      </span>
                      <button
                        type="button"
                        onClick={() => setModalDesejadosAberto(false)}
                        className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-black transition-colors cursor-pointer"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                </div>
              )}
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

            {/* CONTAINER PRINCIPAL DE PRODUTOS: CARDS OU TABELA */}
            <div className="bg-[#0e1626] rounded-2xl border border-slate-800 shadow-xl overflow-hidden relative">
              
              {/* Barra animada de status durante carregamento ou cotação */}
              {(refreshing || (statusCotacao && statusCotacao.emAndamento)) && (
                <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-blue-500 animate-pulse belaped-no-print"></div>
              )}

              {modoVisualizacao === 'cards' ? (
                <div className={`p-4 space-y-4 overflow-auto ${modoTabelaExpandida ? 'max-h-[82vh]' : 'max-h-[68vh]'} custom-scrollbar`}>
                  {/* Barra de Seleção e Resumo no Modo Cards */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-[#080f1d] p-3 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={faltasFiltradas.length > 0 && faltasFiltradas.every(f => itensSelecionados[f.produto_id])}
                          onChange={() => {
                            const listaAlvo = faltasFiltradas;
                            const todosMarcados = listaAlvo.length > 0 && listaAlvo.every(f => itensSelecionados[f.produto_id]);
                            const novoMap = { ...itensSelecionados };
                            listaAlvo.forEach(f => {
                              if (!todosMarcados && (f.nao_carrinho || f.nao_cotar || f.is_adiado_proxima_semana || f.is_ja_pedido)) {
                                novoMap[f.produto_id] = false;
                              } else {
                                novoMap[f.produto_id] = !todosMarcados;
                              }
                            });
                            setItensSelecionados(novoMap);
                          }}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                        />
                        <span>Selecionar Todos ({faltasFiltradas.length})</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">Total Selecionado:</span>
                      <b className="text-emerald-400 font-black">
                        R$ {totaisSelecionados.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </b>
                      <span className="text-slate-500">({totaisSelecionados.qtdItens} produtos)</span>
                    </div>
                  </div>

                  {/* Lista de Cards */}
                  {agruparPorDistribuidora ? (
                    <div className="space-y-6">
                      {totaisPorDistribuidora.map(grupo => (
                        <div key={grupo.distribuidora} className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-cyan-950/60 to-slate-900/80 p-3 rounded-xl border border-cyan-800/60">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-cyan-300 uppercase">{grupo.distribuidora}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
                                {grupo.qtdProdutos} produtos ({grupo.qtdUnidades} un)
                              </span>
                              {grupo.pedidoMinimo > 0 && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                                  grupo.atingiuMinimo
                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600'
                                    : 'bg-amber-950/80 text-amber-300 border-amber-600'
                                }`}>
                                  {grupo.atingiuMinimo ? '✓ Mínimo Atingido' : `⚠️ Faltam R$ ${grupo.faltaParaMinimo.toFixed(2)}`}
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-black text-emerald-300">
                              Total: R$ {grupo.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {ordenarListaFaltas(grupo.itens).map(item => renderProdutoCard(item))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : faltasFiltradas.length === 0 ? (
                    <div className="p-12 text-center bg-[#091120] rounded-2xl border border-slate-800">
                      <p className="text-sm font-bold text-slate-400">Nenhum produto encontrado com os filtros selecionados.</p>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {/* ─── SEÇÃO A: PRODUTOS NA COTA SEMANAL (TOP PRIORIDADE) ─── */}
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-emerald-950/80 via-[#0c241d] to-slate-900/90 p-3.5 rounded-xl border border-emerald-600/80 shadow-md">
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-black text-emerald-300 uppercase flex items-center gap-2">
                              <span className="p-1 rounded-md bg-emerald-900/80 text-emerald-300 border border-emerald-500/60">⭐</span>
                              <span>Produtos na Cota Semanal (Top Prioridade)</span>
                            </span>
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-900/90 text-emerald-200 font-black border border-emerald-600/80">
                              {itensNaCotaSemanal.length} produtos
                            </span>
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#081322] text-cyan-300 font-black border border-cyan-800/80">
                              R$ {itensNaCotaSemanal.reduce((acc, i) => acc + Number(i.subtotal_7d || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="text-xs text-slate-300 font-medium">
                            Itens prioritários enquadrados nos 80% da cota semanal ({janelaAtivaData?.nomeMes || 'Janela'}).
                          </div>
                        </div>

                        {itensNaCotaSemanal.length === 0 ? (
                          <div className="p-8 text-center bg-[#091120]/80 rounded-2xl border border-slate-800 space-y-2">
                            <p className="text-sm font-bold text-slate-300">Nenhum produto ativo dentro da cota semanal.</p>
                            <p className="text-xs text-slate-400">
                              Clique no botão <b className="text-emerald-400">"⚡ Preencher Cota Enxuta"</b> no topo para selecionar os itens mais urgentes automaticamente.
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {itensNaCotaSemanal.map(item => renderProdutoCard(item))}
                          </div>
                        )}
                      </div>

                      {/* ─── SEÇÃO B: BANCO DE ESPERA & PRÓXIMOS DA FILA (CASCATA) ─── */}
                      <div className="space-y-3 pt-2">
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-900/90 via-[#101b2f] to-[#0a1221] p-3.5 rounded-xl border border-slate-700/80 shadow-md">
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-black text-cyan-300 uppercase flex items-center gap-2">
                              <span className="p-1 rounded-md bg-slate-800 text-cyan-300 border border-slate-700">⏳</span>
                              <span>Banco de Espera & Próximos da Fila</span>
                            </span>
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700">
                              {itensBancoEspera.length} produtos
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-medium">
                            Substituição automática em cascata: ao marcar <b>"📦 Já Pedido"</b> ou adiar um item acima, o 1º da fila sobe para a cota.
                          </div>
                        </div>

                        {itensBancoEspera.length === 0 ? (
                          <div className="p-6 text-center bg-[#091120]/40 rounded-xl border border-slate-800">
                            <p className="text-xs font-bold text-slate-400">Nenhum produto no banco de espera no momento.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {itensBancoEspera.map(item => renderProdutoCard(item))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
              <div className={`overflow-auto ${modoTabelaExpandida ? 'max-h-[82vh]' : 'max-h-[68vh]'} custom-scrollbar relative`}>
                <table className="w-full text-left border-collapse belaped-print-table">
                  <thead className="sticky top-0 z-20 bg-[#09101f] shadow-lg">
                    <tr className="bg-[#09101f] border-b border-slate-700 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                      <th className="py-2 px-2.5 w-16 text-center whitespace-nowrap bg-[#09101f] belaped-no-print print:hidden">
                        <div className="flex items-center justify-center gap-1.5">
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
                          <button
                            type="button"
                            onClick={() => {
                              const novo = !modoTabelaExpandida;
                              setModoTabelaExpandida(novo);
                              try { localStorage.setItem('belaped_tabela_expandida', String(novo)); } catch {}
                            }}
                            className="p-1 rounded hover:bg-slate-800 text-cyan-400 hover:text-white cursor-pointer transition-colors"
                            title={modoTabelaExpandida ? 'Reduzir tabela para o modo normal' : 'Maximizar tabela na tela (ocultar cards do topo)'}
                          >
                            {modoTabelaExpandida ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
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
                        <td colSpan={13} className="py-8 px-4 text-center">
                          {buscaFalta.trim().length >= 2 && resultadosEstoqueReal.length > 0 ? (
                            <div className="max-w-3xl mx-auto p-4 rounded-2xl bg-[#091326] border border-amber-600/70 text-left space-y-2.5 shadow-lg">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                                  💡 Produto localizado no Estoque Real (Fora da Lista de Compra desta Semana)
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  EAN/Busca: <b className="text-white">{buscaFalta.trim()}</b>
                                </span>
                              </div>
                              {resultadosEstoqueReal.slice(0, 3).map((prod) => (
                                <div key={prod.produto_id} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="space-y-1">
                                    <div className="font-black text-white text-sm">{prod.descricao}</div>
                                    <div className="text-xs text-amber-200 font-semibold">
                                      "{prod.justificativa_compra}"
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleIncluirDoEstoqueRealNaCotacao(prod)}
                                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black whitespace-nowrap cursor-pointer shrink-0 flex items-center gap-1.5"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Incluir na Cotação ({qtdIncluirEstoque[prod.produto_id] ?? prod.qtd_sugerida ?? 2} un)</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-500 font-medium">
                              Nenhum produto encontrado com os filtros selecionados.
                            </span>
                          )}
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
                                <td className="py-3 px-3.5 text-center whitespace-nowrap belaped-no-print print:hidden">
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
                                    <td className="py-2.5 px-3.5 text-center whitespace-nowrap belaped-no-print print:hidden">
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
                                          {item.is_desejado && (
                                            <span
                                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-400 whitespace-nowrap shadow-sm animate-pulse"
                                              title="⭐ Produto Desejado adicionado manualmente para cotação e compra"
                                            >
                                              ⭐ Desejado
                                            </span>
                                          )}
                                          {item.ranking_posicao && (
                                            <span
                                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black border whitespace-nowrap ${
                                                item.ranking_posicao <= 10
                                                  ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white border-amber-400'
                                                  : 'bg-cyan-950 text-cyan-300 border-cyan-700'
                                              }`}
                                              title={`Rankeamento #${item.ranking_posicao} de Giro & Ruptura (Score: ${item.score_ranking || 0})`}
                                            >
                                              {item.ranking_posicao <= 3 ? '🔥 ' : ''}#{item.ranking_posicao}
                                            </span>
                                          )}
                                          {item.repassado_de && (
                                            <span
                                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-600 whitespace-nowrap"
                                              title={`Repassado da ${item.repassado_de} (não atingiu o mínimo)`}
                                            >
                                              🔄 Ex-{item.repassado_de.split(' ')[0]}
                                            </span>
                                          )}
                                          {item.prioridade && (
                                            <span
                                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap border ${
                                                item.prioridade === 'P1'
                                                  ? 'bg-rose-950 text-rose-300 border-rose-600 shadow-sm shadow-rose-950/60 animate-pulse'
                                                  : item.prioridade === 'P2'
                                                  ? 'bg-amber-950 text-amber-300 border-amber-600'
                                                  : item.prioridade === 'P3'
                                                  ? 'bg-blue-950 text-blue-300 border-blue-600'
                                                  : 'bg-slate-900 text-slate-400 border-slate-700'
                                              }`}
                                              title={`${item.prioridade}: ${item.prioridade_rotulo || 'Prioridade de Cotação'}`}
                                            >
                                              {item.prioridade === 'P1' && '🚨 P1 Crítico'}
                                              {item.prioridade === 'P2' && '⚠️ P2 Risco'}
                                              {item.prioridade === 'P3' && '💼 P3 Orçam.'}
                                              {item.prioridade === 'P4' && '📦 P4'}
                                            </span>
                                          )}
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
                                          {item.falta_balcao_belinha && (
                                            <span
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-700/80 shadow-xs whitespace-nowrap"
                                              title={`📋 Livro de Faltas do Balcão: Anotado por ${item.falta_balcao_belinha.userName || 'Balconista'}${item.falta_balcao_belinha.clientInquiry ? ' (Cliente procurou)' : ''}${item.falta_balcao_belinha.notes ? ` - Obs: ${item.falta_balcao_belinha.notes}` : ''}`}
                                            >
                                              📋 Balcão {item.falta_balcao_belinha.userName ? `(${item.falta_balcao_belinha.userName})` : ''}
                                            </span>
                                          )}
                                          {item.is_adiado_proxima_semana && (
                                            <span
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-950 text-indigo-300 border border-indigo-600/80 shadow-xs whitespace-nowrap animate-pulse"
                                              title={`📅 Adiado até ${item.adiar_ate}. Não será cotado nesta semana.`}
                                            >
                                              📅 Próx. Semana
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
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                                            {(() => {
                                              const linkProd = obterLinkDistribuidoraProduto(item, 1);
                                              return linkProd ? (
                                                <a
                                                  href={linkProd}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  onClick={() => handleAbrirLinkDistribuidora(item)}
                                                  className="inline-flex items-center gap-1 font-bold text-emerald-300 hover:text-emerald-100 hover:underline text-xs truncate max-w-[135px] group transition-all"
                                                  title={`🔗 Conferir "${item.descricao}" no portal da ${fornecedor1} (O EAN será copiado automaticamente)`}
                                                >
                                                  <span className="truncate">{fornecedor1}</span>
                                                  <ExternalLink className="w-3 h-3 text-emerald-400 shrink-0 group-hover:scale-125 transition-transform" />
                                                </a>
                                              ) : (
                                                <span className="font-bold text-emerald-300 text-xs truncate max-w-[130px]" title={fornecedor1}>
                                                  {fornecedor1}
                                                </span>
                                              );
                                            })()}
                                            {item.condicao_comercial_1 && (
                                              <span
                                                className="px-1 py-0.2 rounded text-[9px] font-black bg-amber-950 text-amber-300 border border-amber-700/80 shrink-0 whitespace-nowrap"
                                                title={`🏷️ Campanha Comercial: ${item.condicao_comercial_1}${item.preco_padrao_1 ? ` | Padrão: R$ ${item.preco_padrao_1.toFixed(2)}` : ''}`}
                                              >
                                                🏷️ {item.condicao_comercial_1.length > 14 ? item.condicao_comercial_1.slice(0, 12) + '..' : item.condicao_comercial_1}
                                              </span>
                                            )}
                                            {item.is_generico_mais_barato_1 && (
                                              <span
                                                className="px-1 py-0.2 rounded text-[9px] font-black bg-cyan-950 text-cyan-300 border border-cyan-700/80 shrink-0 whitespace-nowrap"
                                                title="⚡ Oferta vencedora encontrada em genérico equivalente com mesmo princípio ativo e dosagem"
                                              >
                                                ⚡ Genérico
                                              </span>
                                            )}
                                            {item.is_substituto_1 && (
                                              <span
                                                className="px-1 py-0.2 rounded text-[9px] font-black bg-purple-950 text-purple-300 border border-purple-700/80 shrink-0 whitespace-nowrap"
                                                title={`⚡ Substituto eleito por Essência: ${item.laboratorio_1 || 'Genérico'} (EAN: ${item.ean_substituto_1})`}
                                              >
                                                ⚡ {item.laboratorio_1 ? `Subst: ${item.laboratorio_1}` : 'Substituto'}
                                              </span>
                                            )}
                                          </div>
                                      ) : semEstoquePortais ? (
                                        <div className="flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                                          <span className="font-semibold text-amber-400/90 text-xs">
                                            Sem Estoque (9 Portais)
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
                                        {(() => {
                                          const diffUltCompra = (preco1 && precoUltCompra > 0)
                                            ? Number((((preco1 - precoUltCompra) / precoUltCompra) * 100).toFixed(1))
                                            : 0;
                                          const isDivergente = preco1 && precoUltCompra > 0 && (diffUltCompra <= -40 || diffUltCompra >= 60);
                                          if (!isDivergente) return null;
                                          return (
                                            <button
                                              type="button"
                                              onClick={() => handleRecotarProduto(item)}
                                              disabled={recotandoEan === item.ean}
                                              className={`p-1 rounded text-[10px] font-black inline-flex items-center gap-0.5 border transition-all cursor-pointer ${
                                                diffUltCompra <= -40
                                                  ? 'bg-rose-950/90 text-rose-300 border-rose-600 hover:bg-rose-900 animate-pulse'
                                                  : 'bg-amber-950/90 text-amber-300 border-amber-600 hover:bg-amber-900'
                                              }`}
                                              title={`⚠️ Grande divergência (${diffUltCompra > 0 ? '+' : ''}${diffUltCompra}% vs últ. compra R$ ${precoUltCompra.toFixed(2)}). Clique para rodar o robô novamente neste produto.`}
                                            >
                                              <RotateCcw className={`w-3 h-3 ${recotandoEan === item.ean ? 'animate-spin text-cyan-400' : ''}`} />
                                              <span>{diffUltCompra > 0 ? '+' : ''}{diffUltCompra.toFixed(0)}%</span>
                                            </button>
                                          );
                                        })()}
                                        <button
                                          type="button"
                                          onClick={() => setModalConcorrentesEssencia({ isOpen: true, produto: item })}
                                          className="p-1 rounded bg-[#071324] hover:bg-purple-900/60 text-purple-400 border border-purple-800/80 transition-colors cursor-pointer ml-1"
                                          title="Ver todos os concorrentes e marcas cotadas na essência farmacológica"
                                        >
                                          <ArrowRightLeft className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRecotarProduto(item)}
                                          disabled={recotandoEan === item.ean}
                                          className={`p-1 rounded border transition-colors cursor-pointer ml-1 ${
                                            recotandoEan === item.ean
                                              ? 'bg-amber-950 text-amber-300 border-amber-600 animate-pulse'
                                              : 'bg-[#071324] hover:bg-cyan-900/60 text-cyan-400 border border-cyan-800/80 hover:border-cyan-400'
                                          }`}
                                          title={`🔄 Re-cotar "${item.descricao}" sob demanda nos portais`}
                                        >
                                          <RotateCcw className={`w-3.5 h-3.5 ${recotandoEan === item.ean ? 'animate-spin text-amber-300' : ''}`} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setModalHistoricoPreco({ isOpen: true, produto: item })}
                                          className="p-1 rounded bg-[#071324] hover:bg-cyan-900/60 text-cyan-400 border border-cyan-800/80 transition-colors cursor-pointer ml-1"
                                          title="Ver série temporal de preços, melhor dia da semana e compras reais"
                                        >
                                          <LineChart className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => handleAlternarAdiarProximaSemana(item, e)}
                                          className={`p-1 rounded border transition-colors cursor-pointer ml-1 ${
                                            item.is_adiado_proxima_semana
                                              ? 'bg-indigo-950 text-indigo-300 border-indigo-500 shadow-sm animate-pulse'
                                              : 'bg-[#071324] hover:bg-indigo-950/60 text-slate-400 hover:text-indigo-300 border border-slate-800 hover:border-indigo-600'
                                          }`}
                                          title={
                                            item.is_adiado_proxima_semana
                                              ? `📅 Adiado até ${item.adiar_ate}. Não será cotado nesta semana nem entrará no carrinho. Clique para reativar agora.`
                                              : '📅 Deixar para cotar na próxima semana (+7 dias)'
                                          }
                                        >
                                          <Calendar className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3.5 whitespace-nowrap bg-slate-900/30">
                                      {(() => {
                                        if (!fornecedor2) return <span className="text-slate-500 text-xs">—</span>;
                                        const linkProd2 = obterLinkDistribuidoraProduto(item, 2);
                                        return linkProd2 ? (
                                          <a
                                            href={linkProd2}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() => handleAbrirLinkDistribuidora(item)}
                                            className="inline-flex items-center gap-1 text-slate-300 hover:text-white hover:underline font-medium text-xs truncate max-w-[130px] group transition-all"
                                            title={`🔗 Conferir "${item.descricao}" no portal da ${fornecedor2} (O EAN será copiado automaticamente)`}
                                          >
                                            <span className="truncate">{fornecedor2}</span>
                                            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0 group-hover:scale-125 transition-transform" />
                                          </a>
                                        ) : (
                                          <span className="text-slate-300 font-medium text-xs truncate max-w-[130px] block" title={fornecedor2}>
                                            {fornecedor2}
                                          </span>
                                        );
                                      })()}
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
                            <td className="py-2.5 px-3.5 text-center whitespace-nowrap belaped-no-print print:hidden">
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
                                  {item.is_desejado && (
                                    <span
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-400 whitespace-nowrap shadow-sm animate-pulse"
                                      title="⭐ Produto Desejado adicionado manualmente para cotação e compra"
                                    >
                                      ⭐ Desejado
                                    </span>
                                  )}
                                  {item.ranking_posicao && (
                                    <span
                                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black border whitespace-nowrap ${
                                        item.ranking_posicao <= 10
                                          ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white border-amber-400'
                                          : 'bg-cyan-950 text-cyan-300 border-cyan-700'
                                      }`}
                                      title={`Rankeamento #${item.ranking_posicao} de Giro & Ruptura (Score: ${item.score_ranking || 0})`}
                                    >
                                      {item.ranking_posicao <= 3 ? '🔥 ' : ''}#{item.ranking_posicao}
                                    </span>
                                  )}
                                  {item.repassado_de && (
                                    <span
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-600 whitespace-nowrap"
                                      title={`Repassado da ${item.repassado_de} (não atingiu o mínimo)`}
                                    >
                                      🔄 Ex-{item.repassado_de.split(' ')[0]}
                                    </span>
                                  )}
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
                                  {item.falta_balcao_belinha && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-700/80 shadow-xs whitespace-nowrap"
                                      title={`📋 Livro de Faltas do Balcão: Anotado por ${item.falta_balcao_belinha.userName || 'Balconista'}${item.falta_balcao_belinha.clientInquiry ? ' (Cliente procurou)' : ''}${item.falta_balcao_belinha.notes ? ` - Obs: ${item.falta_balcao_belinha.notes}` : ''}`}
                                    >
                                      📋 Balcão {item.falta_balcao_belinha.userName ? `(${item.falta_balcao_belinha.userName})` : ''}
                                    </span>
                                  )}
                                  {item.is_adiado_proxima_semana && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-950 text-indigo-300 border border-indigo-600/80 shadow-xs whitespace-nowrap animate-pulse"
                                      title={`📅 Adiado até ${item.adiar_ate}. Não será cotado nesta semana.`}
                                    >
                                      📅 Próx. Semana
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
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                                  {(() => {
                                    const linkProd = obterLinkDistribuidoraProduto(item, 1);
                                    return linkProd ? (
                                      <a
                                        href={linkProd}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => handleAbrirLinkDistribuidora(item)}
                                        className="inline-flex items-center gap-1 font-bold text-emerald-300 hover:text-emerald-100 hover:underline text-xs truncate max-w-[135px] group transition-all"
                                        title={`🔗 Conferir "${item.descricao}" no portal da ${fornecedor1} (O EAN será copiado automaticamente)`}
                                      >
                                        <span className="truncate">{fornecedor1}</span>
                                        <ExternalLink className="w-3 h-3 text-emerald-400 shrink-0 group-hover:scale-125 transition-transform" />
                                      </a>
                                    ) : (
                                      <span className="font-bold text-emerald-300 text-xs truncate max-w-[130px]" title={fornecedor1}>
                                        {fornecedor1}
                                      </span>
                                    );
                                  })()}
                                  {item.condicao_comercial_1 && (
                                    <span
                                      className="px-1 py-0.2 rounded text-[9px] font-black bg-amber-950 text-amber-300 border border-amber-700/80 shrink-0 whitespace-nowrap"
                                      title={`🏷️ Campanha Comercial: ${item.condicao_comercial_1}${item.preco_padrao_1 ? ` | Padrão: R$ ${item.preco_padrao_1.toFixed(2)}` : ''}`}
                                    >
                                      🏷️ {item.condicao_comercial_1.length > 14 ? item.condicao_comercial_1.slice(0, 12) + '..' : item.condicao_comercial_1}
                                    </span>
                                  )}
                                  {item.is_generico_mais_barato_1 && (
                                    <span
                                      className="px-1 py-0.2 rounded text-[9px] font-black bg-cyan-950 text-cyan-300 border border-cyan-700/80 shrink-0 whitespace-nowrap"
                                      title="⚡ Oferta vencedora encontrada em genérico equivalente com mesmo princípio ativo e dosagem"
                                    >
                                      ⚡ Genérico
                                    </span>
                                  )}
                                  {item.is_substituto_1 && (
                                    <span
                                      className="px-1 py-0.2 rounded text-[9px] font-black bg-purple-950 text-purple-300 border border-purple-700/80 shrink-0 whitespace-nowrap"
                                      title={`⚡ Substituto eleito por Essência: ${item.laboratorio_1 || 'Genérico'} (EAN: ${item.ean_substituto_1})`}
                                    >
                                      ⚡ {item.laboratorio_1 ? `Subst: ${item.laboratorio_1}` : 'Substituto'}
                                    </span>
                                  )}
                                </div>
                              ) : semEstoquePortais ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                                  <span className="font-semibold text-amber-400/90 text-xs" title="Consultado nos 9 portais sem estoque disponível">
                                    Sem Estoque (9 Portais)
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
                                {(() => {
                                  const diffUltCompra = (preco1 && precoUltCompra > 0)
                                    ? Number((((preco1 - precoUltCompra) / precoUltCompra) * 100).toFixed(1))
                                    : 0;
                                  const isDivergente = preco1 && precoUltCompra > 0 && (diffUltCompra <= -40 || diffUltCompra >= 60);
                                  if (!isDivergente) return null;
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleRecotarProduto(item)}
                                      disabled={recotandoEan === item.ean}
                                      className={`p-1 rounded text-[10px] font-black inline-flex items-center gap-0.5 border transition-all cursor-pointer ${
                                        diffUltCompra <= -40
                                          ? 'bg-rose-950/90 text-rose-300 border-rose-600 hover:bg-rose-900 animate-pulse'
                                          : 'bg-amber-950/90 text-amber-300 border-amber-600 hover:bg-amber-900'
                                      }`}
                                      title={`⚠️ Grande divergência (${diffUltCompra > 0 ? '+' : ''}${diffUltCompra}% vs últ. compra R$ ${precoUltCompra.toFixed(2)}). Clique para rodar o robô novamente neste produto.`}
                                    >
                                      <RotateCcw className={`w-3 h-3 ${recotandoEan === item.ean ? 'animate-spin text-cyan-400' : ''}`} />
                                      <span>{diffUltCompra > 0 ? '+' : ''}{diffUltCompra.toFixed(0)}%</span>
                                    </button>
                                  );
                                })()}
                                <button
                                  type="button"
                                  onClick={() => setModalConcorrentesEssencia({ isOpen: true, produto: item })}
                                  className="p-1 rounded bg-[#071324] hover:bg-purple-900/60 text-purple-400 border border-purple-800/80 transition-colors cursor-pointer ml-1"
                                  title="Ver todos os concorrentes e marcas cotadas na essência farmacológica"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRecotarProduto(item)}
                                  disabled={recotandoEan === item.ean}
                                  className={`p-1 rounded border transition-colors cursor-pointer ml-1 ${
                                    recotandoEan === item.ean
                                      ? 'bg-amber-950 text-amber-300 border-amber-600 animate-pulse'
                                      : 'bg-[#071324] hover:bg-cyan-900/60 text-cyan-400 border border-cyan-800/80 hover:border-cyan-400'
                                  }`}
                                  title={`🔄 Re-cotar "${item.descricao}" sob demanda nos portais`}
                                >
                                  <RotateCcw className={`w-3.5 h-3.5 ${recotandoEan === item.ean ? 'animate-spin text-amber-300' : ''}`} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setModalHistoricoPreco({ isOpen: true, produto: item })}
                                  className="p-1 rounded bg-[#071324] hover:bg-cyan-900/60 text-cyan-400 border border-cyan-800/80 transition-colors cursor-pointer ml-1"
                                  title="Ver série temporal de preços, melhor dia da semana e compras reais"
                                >
                                  <LineChart className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleAlternarAdiarProximaSemana(item, e)}
                                  className={`p-1 rounded border transition-colors cursor-pointer ml-1 ${
                                    item.is_adiado_proxima_semana
                                      ? 'bg-indigo-950 text-indigo-300 border-indigo-500 shadow-sm animate-pulse'
                                      : 'bg-[#071324] hover:bg-indigo-950/60 text-slate-400 hover:text-indigo-300 border border-slate-800 hover:border-indigo-600'
                                  }`}
                                  title={
                                    item.is_adiado_proxima_semana
                                      ? `📅 Adiado até ${item.adiar_ate}. Não será cotado nesta semana nem entrará no carrinho. Clique para reativar agora.`
                                      : '📅 Deixar para cotar na próxima semana (+7 dias)'
                                  }
                                >
                                  <Calendar className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>

                            {/* 2º Colocado (Vendedor) */}
                            <td className="py-2.5 px-3.5 whitespace-nowrap bg-slate-900/30">
                              {(() => {
                                if (!fornecedor2) return <span className="text-slate-500 text-xs">—</span>;
                                const linkProd2 = obterLinkDistribuidoraProduto(item, 2);
                                return linkProd2 ? (
                                  <a
                                    href={linkProd2}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => handleAbrirLinkDistribuidora(item)}
                                    className="inline-flex items-center gap-1 text-slate-300 hover:text-white hover:underline font-medium text-xs truncate max-w-[130px] group transition-all"
                                    title={`🔗 Conferir "${item.descricao}" no portal da ${fornecedor2} (O EAN será copiado automaticamente)`}
                                  >
                                    <span className="truncate">{fornecedor2}</span>
                                    <ExternalLink className="w-3 h-3 text-slate-400 shrink-0 group-hover:scale-125 transition-transform" />
                                  </a>
                                ) : (
                                  <span className="text-slate-300 font-medium text-xs truncate max-w-[130px] block" title={fornecedor2}>
                                    {fornecedor2}
                                  </span>
                                );
                              })()}
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
            )}

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
                    prazos_boleto: '',
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

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1.5 border-t border-slate-800">
                    <span>Pedido Mínimo: <b className="text-white">R$ {portal.pedido_minimo.toFixed(2)}</b></span>
                    <span>Prazo Padrão: <b className="text-white">{portal.prazo_dias_padrao}d</b></span>
                  </div>

                  {/* Informações de Boleto Auditadas / Todas as Opções */}
                  <div className="p-2.5 rounded-xl bg-[#080d18] border border-slate-800/90 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                        <CreditCard className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Opções de Boleto ({((portal.prazos_boleto ? portal.prazos_boleto.split(' | ') : [`${portal.prazo_dias_padrao}d`]).length)}):</span>
                      </div>
                      {portal.data_ultima_auditoria && (
                        <span className="text-[10px] text-slate-500 font-medium shrink-0 ml-1" title={`Última auditoria: ${new Date(portal.data_ultima_auditoria).toLocaleString('pt-BR')}`}>
                          🕒 {new Date(portal.data_ultima_auditoria).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-0.5">
                      {(portal.prazos_boleto ? portal.prazos_boleto.split(' | ') : [`${portal.prazo_dias_padrao}d`]).map((opt, i) => (
                        <span 
                          key={i} 
                          className="px-1.5 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-800/80 text-[10px] font-bold text-emerald-300 whitespace-nowrap shadow-xs"
                          title={`Opção de prazo disponível para ${portal.nome}`}
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
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

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleDispararAuditoriaPrazos(portal.id)}
                        disabled={auditandoPrazos}
                        title={`Auditar prazos e pedido mínimo da ${portal.nome} agora`}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${auditandoPrazos ? 'animate-spin' : ''}`} />
                        <span>Auditar</span>
                      </button>

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
                </div>
              ))}
            </div>

            {/* Carrinhos Otimizados */}
            {carrinhosOtimizados.length > 0 ? (
              <div className="space-y-4 pt-4 border-t border-slate-800">
                {/* Cabeçalho e Ações em Lote */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-[#0e1626] to-slate-900 border border-slate-800 shadow-xl">
                  <div>
                    <h3 className="text-base font-black uppercase text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-cyan-400" />
                      Carrinhos Otimizados (Menor Preço & Pedido Mínimo)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Total Geral: <b className="text-emerald-400 font-black">R$ {resumoSimulacao?.totalGeral?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b> distribuído em <b className="text-white">{carrinhosOtimizados.length} distribuidora(s)</b>.
                      {resumoSimulacao?.economiaTotal > 0 && (
                        <span className="ml-2 text-emerald-300 font-bold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/80">
                          Economia: R$ {resumoSimulacao.economiaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Botão 0: Criar Todos os Carrinhos */}
                    <button
                      onClick={handleMontarTodosCarrinhos}
                      disabled={montandoTodosCarrinhos || comprandoDireto}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black shadow-lg shadow-cyan-950/40 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                      title="Dispara os robôs em fila sequencial para adicionar os produtos nos carrinhos de cada distribuidora"
                    >
                      <ShoppingCart className={`w-4 h-4 text-cyan-200 ${montandoTodosCarrinhos ? 'animate-bounce' : ''}`} />
                      <span>{montandoTodosCarrinhos ? 'Montando Carrinhos...' : '🛒 Criar Todos os Carrinhos'}</span>
                    </button>

                    {/* Botão 1.3: Comprar Todos (Passo a Passo) */}
                    <button
                      onClick={handleIniciarWizardComprarTodos}
                      disabled={montandoTodosCarrinhos || comprandoDireto}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                      title="Abre o assistente guiado para confirmar e realizar a compra direta distribuidora por distribuidora"
                    >
                      <Zap className="w-4 h-4 text-emerald-200" />
                      <span>⚡ Comprar Todos (Passo a Passo)</span>
                    </button>
                  </div>
                </div>

                {/* BARRA DE PROGRESSO UNIFICADA DA MONTAGEM SEQUENCIAL DE TODOS OS CARRINHOS */}
                {statusTodosCarrinhos && statusTodosCarrinhos.emAndamento && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/90 via-slate-900 to-blue-950/90 border-2 border-cyan-500/80 shadow-2xl ring-2 ring-cyan-500/20 space-y-2 animate-pulse">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-cyan-400 animate-spin" />
                        <span className="font-black text-white uppercase tracking-wider">
                          Montando Carrinho {statusTodosCarrinhos.distribuidoraAtualIndex} de {statusTodosCarrinhos.totalDistribuidoras}:
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-black border border-cyan-500/40">
                          {statusTodosCarrinhos.distribuidoraAtualNome}
                        </span>
                      </div>
                      <span className="font-bold text-slate-300">
                        Item {statusTodosCarrinhos.itemAtualIndex} de {statusTodosCarrinhos.totalItensDistribuidora} • {statusTodosCarrinhos.itensSucessoTotal} adicionados
                      </span>
                    </div>

                    <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-700">
                      <div 
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.round(((statusTodosCarrinhos.distribuidoraAtualIndex - 1) / (statusTodosCarrinhos.totalDistribuidoras || 1)) * 100 + ((statusTodosCarrinhos.itemAtualIndex / (statusTodosCarrinhos.totalItensDistribuidora || 1)) * (100 / (statusTodosCarrinhos.totalDistribuidoras || 1)))))}%`
                        }}
                      />
                    </div>

                    <p className="text-[11px] text-slate-300 font-mono truncate">
                      {statusTodosCarrinhos.ultimoItem}
                    </p>
                  </div>
                )}

                {sugestoesReagrupamento.length > 0 && (
                  <div className="text-xs font-bold text-amber-300 bg-amber-950/50 p-3 rounded-2xl border border-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>⚠️ {sugestoesReagrupamento.length} distribuidora(s) abaixo do mínimo tiveram itens repassados para evitar pedidos travados.</span>
                  </div>
                )}

                {/* Cards de Cada Distribuidora */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {carrinhosOtimizados.map((carrinho, idx) => {
                    const portalCad = portais.find(p => p.nome.toUpperCase() === carrinho.distribuidora.toUpperCase());
                    const prazoSugerido = carrinho.boletoEleito || (carrinho.prazoDias ? `${carrinho.prazoDias} DDL` : '28 DDL');
                    const estaComprando = comprandoDireto && distribuidoraComprando === carrinho.distribuidora;

                    return (
                      <div 
                        key={idx}
                        className={`p-4 rounded-2xl border bg-[#0e1626] shadow-lg space-y-3 flex flex-col justify-between ${
                          carrinho.atingiuMinimo 
                            ? 'border-emerald-800/80 shadow-emerald-950/20' 
                            : 'border-amber-800/80 shadow-amber-950/20'
                        }`}
                      >
                        <div className="space-y-2.5">
                          {/* Cabeçalho do Card */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-white uppercase">{carrinho.distribuidora}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                carrinho.atingiuMinimo 
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}>
                                {carrinho.atingiuMinimo ? 'Frete Grátis OK' : `Faltam R$ ${carrinho.faltaParaMinimo?.toFixed(2)}`}
                              </span>
                            </div>

                            <span className="font-black text-base text-cyan-300">
                              R$ {carrinho.total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          {/* 1.1 Sugestão do Melhor Prazo conforme Orçamento */}
                          <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <CreditCard className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <div className="truncate">
                                <span className="text-[10px] uppercase font-bold text-slate-400 block">Melhor Prazo Orçamento:</span>
                                <span className="text-xs font-black text-emerald-300 truncate block">
                                  {prazoSugerido}
                                </span>
                              </div>
                            </div>
                            {prazoSugerido && formatarPrazoComDataVencimento(prazoSugerido) ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-800/70 shrink-0">
                                📅 Venc: {formatarPrazoComDataVencimento(prazoSugerido)}
                              </span>
                            ) : carrinho.mesVencimentoFormatado ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                                Vence em {carrinho.mesVencimentoFormatado}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                            <span>Itens: <b className="text-white">{carrinho.itens?.length || 0} produtos</b></span>
                            <span>Mínimo: <b className="text-white">R$ {carrinho.pedidoMinimo?.toFixed(2)}</b></span>
                          </div>

                          {/* Lista compacta de produtos */}
                          <div className="max-h-32 overflow-y-auto space-y-1 divide-y divide-slate-800/60 text-xs pr-1">
                            {carrinho.itens?.map((it: any, itIdx: number) => (
                              <div key={itIdx} className="pt-1 flex items-center justify-between gap-2">
                                <div className="truncate min-w-0 flex items-center gap-1.5">
                                  <span className="text-slate-400 font-bold shrink-0">{it.quantidade}x</span>
                                  <span className="truncate font-medium text-slate-300" title={it.descricao}>
                                    {it.descricao}
                                  </span>
                                  {it.repassado && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800 text-[9px] font-black shrink-0" title={it.motivoRepasse}>
                                      Repassado de {it.repassadoDe}
                                    </span>
                                  )}
                                </div>
                                <span className="font-black text-white shrink-0">
                                  R$ {it.subtotal?.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Botões de Ação do Card: Ver Carrinho (Modal Belinha) e Comprar na Empresa */}
                        <div className="pt-2.5 border-t border-slate-800 space-y-1.5">
                          <div className="grid grid-cols-2 gap-2">
                            {/* 1.1 Acesso ao Carrinho (Modal no Belinha) */}
                            <button
                              onClick={() => handleAbrirModalCarrinho(carrinho)}
                              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold transition-all cursor-pointer border border-slate-700 shadow-sm"
                              title="Visualizar produtos e trocar prazo de boleto no modal do Belinha"
                            >
                              <Layers className="w-3.5 h-3.5 text-cyan-400" />
                              <span>👁️ Ver Carrinho</span>
                            </button>

                            {/* 1.2 Botão de Comprar daquela empresa */}
                            <button
                              onClick={() => handleComprarCarrinhoDireto(carrinho, prazoSugerido)}
                              disabled={estaComprando || montandoTodosCarrinhos}
                              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black transition-all cursor-pointer shadow-md disabled:opacity-50"
                              title={`Comprar diretamente na ${carrinho.distribuidora} no prazo ${prazoSugerido}`}
                            >
                              {estaComprando ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Comprando...</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="w-3.5 h-3.5 text-yellow-300" />
                                  <span>Comprar Direto</span>
                                </>
                              )}
                            </button>
                          </div>

                          <button
                            onClick={() => handleAbrirNavegadorCarrinho(carrinho)}
                            className="w-full flex items-center justify-center gap-1.5 py-1 text-[11px] font-bold text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Abrir Navegador no Portal da {carrinho.distribuidora}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
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

              <div>
                <label className="font-bold text-slate-300 block mb-1">Prazos de Boletos Auditados / Detectados</label>
                <input
                  type="text"
                  value={portalEditando.prazos_boleto || ''}
                  onChange={(e) => setPortalEditando({ ...portalEditando, prazos_boleto: e.target.value })}
                  placeholder="Ex: 28 DDL | 28/35/42 DDL"
                  className="w-full p-2.5 rounded-xl border border-slate-700 bg-[#080d18] text-emerald-400 font-bold"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Preenchido e atualizado automaticamente pela rotina quinzenal de auditoria com cautela.
                </span>
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

      {/* ─── MODAL/GAVETA: LIVRO DE FALTAS DO BALCÃO (BELINHA) ───────────────── */}
      {gavetaBalcaoAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0e1626] rounded-3xl max-w-2xl w-full border border-fuchsia-800/60 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Cabeçalho */}
            <div className="p-4 px-6 bg-gradient-to-r from-fuchsia-950/80 via-[#180a24] to-[#0e1626] border-b border-fuchsia-800/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                    Livro de Faltas do Balcão (Belinha)
                  </h3>
                  <span className="text-xs text-fuchsia-300/80 font-medium">
                    {faltasBalcaoBelinha.length} produto(s) anotado(s) pelos balconistas aguardando compra
                  </span>
                </div>
              </div>
              <button
                onClick={() => setGavetaBalcaoAberta(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista de Faltas */}
            <div className="p-4 overflow-y-auto custom-scrollbar space-y-2.5 flex-1">
              {faltasBalcaoBelinha.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs font-medium space-y-1">
                  <p>🎉 Nenhuma falta pendente registrada no Livro de Faltas do Belinha.</p>
                  <p className="text-[11px] text-slate-600">Novas faltas registradas pelos balconistas aparecerão aqui automaticamente.</p>
                </div>
              ) : (
                faltasBalcaoBelinha.map((fb, idx) => (
                  <div
                    key={fb.id || idx}
                    className="p-3 rounded-2xl bg-[#09101f] border border-slate-800 hover:border-fuchsia-800/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-white truncate">
                          {fb.productName}
                        </span>
                        {fb.clientInquiry && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-950 text-rose-300 border border-rose-700/80">
                            Cliente Procurou
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                        <span>Anotado por: <b className="text-slate-300">{fb.userName || 'Balconista'}</b></span>
                        {fb.createdAt && (
                          <>
                            <span>•</span>
                            <span>{new Date(fb.createdAt).toLocaleDateString('pt-BR')} às {new Date(fb.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </>
                        )}
                      </div>
                      {fb.notes && (
                        <p className="text-[11px] text-amber-300/90 italic bg-amber-950/20 px-2 py-1 rounded-lg border border-amber-900/30">
                          Obs: {fb.notes}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handleAdicionarFaltaBalcaoACotacao(fb)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white text-xs font-black shadow-md transition-all cursor-pointer shrink-0 active:scale-95"
                      title="Adicionar este produto à cotação do BelaPed como item avulso prioritário"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Cotar no BelaPed</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Rodapé */}
            <div className="p-3 px-6 bg-[#09101f] border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span className="text-[11px]">
                💡 Ao cotar, o produto é adicionado com prioridade máxima na lista de cotação.
              </span>
              <button
                onClick={() => setGavetaBalcaoAberta(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE HISTÓRICO DE PREÇOS & SÉRIE TEMPORAL (RECHARTS) ─── */}
      <BelaPedConcorrentesModal
        isOpen={modalConcorrentesEssencia.isOpen}
        onClose={() => setModalConcorrentesEssencia({ isOpen: false, produto: null })}
        ean={modalConcorrentesEssencia.produto?.ean || ''}
        descricao={modalConcorrentesEssencia.produto?.descricao || ''}
        custoUnitario={modalConcorrentesEssencia.produto?.custo_unitario}
        saldo={modalConcorrentesEssencia.produto?.saldo}
      />

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

      {/* ─── MODAL: EXPORTAR PEDIDOS EM ARQUIVO TXT POR CATEGORIA & FORNECEDOR ─── */}
      {modalExportarTxtOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0e1626] rounded-3xl max-w-xl w-full border border-cyan-500/50 shadow-2xl overflow-hidden flex flex-col text-slate-100">
            {/* Cabeçalho */}
            <div className="p-4 px-6 bg-gradient-to-r from-[#0d1e38] via-[#102747] to-[#0e1626] border-b border-cyan-800/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-inner">
                  <FileText className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                    Exportar Arquivo TXT de Compras
                  </h3>
                  <span className="text-xs text-cyan-300/90 font-medium">
                    {totaisSelecionados.qtdItens} produtos selecionados • R$ {totaisSelecionados.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setModalExportarTxtOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo com Opções */}
            <div className="p-6 space-y-3.5">
              <p className="text-xs text-slate-300 leading-relaxed">
                Escolha o formato desejado para gerar e baixar os arquivos no seu computador:
              </p>

              {/* Opção 1: Consolidado com divisão interna de Categoria e Fornecedor */}
              <button
                type="button"
                onClick={() => handleGerarRelatorioTxt('FORNECEDOR_E_CATEGORIA')}
                className="w-full text-left p-4 rounded-2xl border border-cyan-600/60 bg-gradient-to-r from-cyan-950/60 to-[#0c1a30] hover:border-cyan-400 hover:from-cyan-950 hover:to-[#0e203b] transition-all cursor-pointer shadow-md group"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 group-hover:scale-105 transition-transform shrink-0 mt-0.5">
                    <FileDown className="w-5 h-5 text-cyan-300" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-white group-hover:text-cyan-200">
                        📄 Arquivo Completo (Fornecedor + Categorias)
                      </span>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                        Recomendado
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 font-medium mt-1">
                      Gera um arquivo TXT único com todos os fornecedores. Dentro de cada distribuidora, os produtos são divididos em seções de <b>Medicamentos</b> e <b>Perfumaria</b> com seus respectivos subtotais.
                    </p>
                  </div>
                </div>
              </button>

              {/* Opção 2: Somente Medicamentos */}
              <button
                type="button"
                onClick={() => handleGerarRelatorioTxt('SO_MEDICAMENTOS')}
                className="w-full text-left p-3.5 rounded-2xl border border-emerald-800/60 bg-emerald-950/30 hover:border-emerald-500 hover:bg-emerald-950/50 transition-all cursor-pointer shadow-sm group"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 group-hover:scale-105 transition-transform shrink-0 mt-0.5">
                    <Pill className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-black text-white group-hover:text-emerald-200 block">
                      💊 Somente Medicamentos por Fornecedor
                    </span>
                    <p className="text-xs text-slate-300 font-medium mt-0.5">
                      Filtra e exporta estritamente os medicamentos agrupados pelas distribuidoras cotadas.
                    </p>
                  </div>
                </div>
              </button>

              {/* Opção 3: Somente Perfumaria */}
              <button
                type="button"
                onClick={() => handleGerarRelatorioTxt('SO_PERFUMARIA')}
                className="w-full text-left p-3.5 rounded-2xl border border-purple-800/60 bg-purple-950/30 hover:border-purple-500 hover:bg-purple-950/50 transition-all cursor-pointer shadow-sm group"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-purple-600/20 text-purple-300 border border-purple-500/40 group-hover:scale-105 transition-transform shrink-0 mt-0.5">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-black text-white group-hover:text-purple-200 block">
                      🧴 Somente Perfumaria & Higiene por Fornecedor
                    </span>
                    <p className="text-xs text-slate-300 font-medium mt-0.5">
                      Filtra e exporta itens de perfumaria, higiene e não-medicamentos por distribuidora.
                    </p>
                  </div>
                </div>
              </button>

              {/* Opção 4: Arquivos TXT Separados por Distribuidora */}
              <button
                type="button"
                onClick={() => handleGerarRelatorioTxt('ARQUIVOS_SEPARADOS')}
                className="w-full text-left p-3.5 rounded-2xl border border-amber-800/60 bg-amber-950/30 hover:border-amber-500 hover:bg-amber-950/50 transition-all cursor-pointer shadow-sm group"
              >
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-amber-600/20 text-amber-300 border border-amber-500/40 group-hover:scale-105 transition-transform shrink-0 mt-0.5">
                    <FolderDown className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-black text-white group-hover:text-amber-200 block">
                      📁 Baixar Arquivo Individual para Cada Fornecedor
                    </span>
                    <p className="text-xs text-slate-300 font-medium mt-0.5">
                      Gera um arquivo TXT separado para cada distribuidora (ex: <i>pedido_PROFARMA.txt</i>, <i>pedido_DISTRIMED.txt</i>) com as categorias divididas internamente.
                    </p>
                  </div>
                </div>
              </button>
            </div>

            {/* Rodapé */}
            <div className="p-4 px-6 bg-[#080d18] border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setModalExportarTxtOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: RELATÓRIO DE AUDITORIA & REPASSE DO CARRINHO (ROBÔ) ─── */}
      {modalRelatorioAberto && ultimoRelatorioAuditoria && (() => {
        const rel = ultimoRelatorioAuditoria;
        const listaItens = [
          ...(rel.itensAdicionados || []).map((i: any) => ({ ...i, tipoItem: 'ADICIONADO' })),
          ...(rel.itensRepassados2Colocado || []).map((i: any) => ({ ...i, tipoItem: 'REPASSADO' })),
          ...(rel.itensSemEstoqueGeral || []).map((i: any) => ({ ...i, tipoItem: 'SEM_ESTOQUE' }))
        ];

        const itensFiltrados = listaItens.filter((item: any) => {
          if (abaRelatorioAuditoria === 'ADICIONADOS' && item.tipoItem !== 'ADICIONADO') return false;
          if (abaRelatorioAuditoria === 'REPASSADOS' && item.tipoItem !== 'REPASSADO') return false;
          if (abaRelatorioAuditoria === 'SEM_ESTOQUE' && item.tipoItem !== 'SEM_ESTOQUE') return false;
          if (buscaRelatorioAuditoria.trim()) {
            const b = buscaRelatorioAuditoria.toUpperCase().trim();
            const desc = (item.descricao || '').toUpperCase();
            const ean = (item.ean || '').toUpperCase();
            const fDest = (item.fornecedor_destino || '').toUpperCase();
            return desc.includes(b) || ean.includes(b) || fDest.includes(b);
          }
          return true;
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-[#0b1222] rounded-3xl max-w-5xl w-full border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-100">
              
              {/* Cabeçalho */}
              <div className="p-5 px-6 bg-[#0e172a] border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      Relatório de Auditoria do Robô • <span className="text-cyan-400 uppercase">{rel.distribuidora}</span>
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      Conferência de itens inseridos e repasse automático para o 2º colocado quando sem estoque.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setModalRelatorioAberto(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* KPI Cards */}
              <div className="p-5 px-6 grid grid-cols-2 md:grid-cols-5 gap-3 bg-[#080d1a] border-b border-slate-800/80">
                <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Adicionados
                  </span>
                  <div className="mt-2">
                    <span className="text-xl font-black text-emerald-200 block">
                      {rel.sucessos} itens
                    </span>
                    <span className="text-xs text-emerald-300 font-bold">
                      R$ {Number(rel.totalAdicionadoReais || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Economia Líquida vs Última Compra */}
                <div className={`p-3.5 rounded-2xl flex flex-col justify-between border ${
                  Number(rel.economiaTotalReais || 0) > 0
                    ? 'bg-teal-950/50 border-teal-500/50 text-teal-200'
                    : Number(rel.economiaTotalReais || 0) < 0
                    ? 'bg-rose-950/50 border-rose-500/50 text-rose-200'
                    : 'bg-slate-900/60 border-slate-700 text-slate-300'
                }`}>
                  <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {Number(rel.economiaTotalReais || 0) >= 0 ? 'Economia vs Últ. Compra' : 'Gasto Adicional'}
                  </span>
                  <div className="mt-2">
                    <span className="text-xl font-black block">
                      {Number(rel.economiaTotalReais || 0) >= 0 ? 'R$ ' : '+R$ '}
                      {Math.abs(Number(rel.economiaTotalReais || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[11px] font-bold block">
                      {Number(rel.economiaTotalReais || 0) >= 0
                        ? `-${Math.abs(Number(rel.economiaTotalPct || 0))}% vs Última Compra`
                        : `+${Math.abs(Number(rel.economiaTotalPct || 0))}% acima da Últ. Compra`}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Repassados (2º Col)
                  </span>
                  <div className="mt-2">
                    <span className="text-xl font-black text-amber-200 block">
                      {rel.itensRepassados2Colocado?.length || 0} itens
                    </span>
                    <span className="text-xs text-amber-300 font-bold">
                      R$ {Number(rel.totalRepassadoReais || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/40 flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Sem Estoque Geral
                  </span>
                  <div className="mt-2">
                    <span className="text-xl font-black text-rose-200 block">
                      {rel.itensSemEstoqueGeral?.length || 0} itens
                    </span>
                    <span className="text-[10px] text-rose-400 font-medium">
                      Esgotado em todos portais
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-700/60 flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5" /> Total Processado
                  </span>
                  <div className="mt-2">
                    <span className="text-xl font-black text-white block">
                      {rel.totalSolicitado} itens
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Base Última: R$ {Number(rel.totalUltimaCompraReais || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Filtros e Busca */}
              <div className="p-3 px-6 bg-[#0a1120] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setAbaRelatorioAuditoria('TODOS')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      abaRelatorioAuditoria === 'TODOS'
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'bg-slate-800/80 text-slate-400 hover:text-white'
                    }`}
                  >
                    Todos ({listaItens.length})
                  </button>
                  <button
                    onClick={() => setAbaRelatorioAuditoria('ADICIONADOS')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      abaRelatorioAuditoria === 'ADICIONADOS'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-800/80 text-slate-400 hover:text-white'
                    }`}
                  >
                    Adicionados ({rel.itensAdicionados?.length || 0})
                  </button>
                  <button
                    onClick={() => setAbaRelatorioAuditoria('REPASSADOS')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      abaRelatorioAuditoria === 'REPASSADOS'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-slate-800/80 text-slate-400 hover:text-white'
                    }`}
                  >
                    Repassados ({rel.itensRepassados2Colocado?.length || 0})
                  </button>
                  <button
                    onClick={() => setAbaRelatorioAuditoria('SEM_ESTOQUE')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      abaRelatorioAuditoria === 'SEM_ESTOQUE'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-slate-800/80 text-slate-400 hover:text-white'
                    }`}
                  >
                    Sem Estoque ({rel.itensSemEstoqueGeral?.length || 0})
                  </button>
                </div>

                <div className="relative w-72">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={buscaRelatorioAuditoria}
                    onChange={(e) => setBuscaRelatorioAuditoria(e.target.value)}
                    placeholder="Filtrar por produto, EAN ou fornecedor..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Tabela de Alta Densidade com Auditoria Financeira */}
              <div className="flex-1 overflow-auto p-4 max-h-[460px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-[#0e172a] shadow-xs z-10 text-slate-300 border-b border-slate-700/80">
                    <tr>
                      <th className="py-2.5 px-3 w-32 whitespace-nowrap font-bold">EAN</th>
                      <th className="py-2.5 px-3 min-w-[240px] whitespace-nowrap font-bold">Produto</th>
                      <th className="py-2.5 px-2.5 w-16 text-center whitespace-nowrap font-bold">Qtd</th>
                      <th className="py-2.5 px-3 w-36 whitespace-nowrap font-bold">Status Robô</th>
                      <th className="py-2.5 px-3 min-w-[180px] whitespace-nowrap font-bold">Fornecedor Alocado</th>
                      <th className="py-2.5 px-3 w-28 text-right whitespace-nowrap font-bold">Subtotal</th>
                      <th className="py-2.5 px-3 w-28 text-right whitespace-nowrap font-bold">Últ. Compra</th>
                      <th className="py-2.5 px-3 w-32 text-center whitespace-nowrap font-bold">Economia / Dif.</th>
                      <th className="py-2.5 px-3 min-w-[180px] whitespace-nowrap font-bold">Motivo / Auditoria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {itensFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-8 text-slate-400">
                          Nenhum item corresponde ao filtro selecionado.
                        </td>
                      </tr>
                    ) : (
                      itensFiltrados.map((item: any, idx: number) => {
                        const isAdicionado = item.tipoItem === 'ADICIONADO';
                        const isRepassado = item.tipoItem === 'REPASSADO';
                        const isSemEstoque = item.tipoItem === 'SEM_ESTOQUE';
                        const precoUlt = Number(item.preco_ult_compra || 0);
                        const difReais = Number(item.diferenca_reais || 0);
                        const varPct = Number(item.variacao_pct || 0);

                        return (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                              {item.ean}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className="font-bold text-slate-200 block truncate max-w-[280px]" title={item.descricao}>
                                {item.descricao || 'Item sem descrição'}
                              </span>
                            </td>
                            <td className="py-2 px-2.5 text-center whitespace-nowrap font-bold text-white">
                              {item.quantidade} un
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              {isAdicionado && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                                  <CheckCircle2 className="w-3 h-3" /> ADICIONADO
                                </span>
                              )}
                              {isRepassado && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-500/50">
                                  <ArrowRightLeft className="w-3 h-3" /> REPASSADO (2º COL)
                                </span>
                              )}
                              {isSemEstoque && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-950 text-rose-300 border border-rose-500/50">
                                  <AlertTriangle className="w-3 h-3" /> SEM ESTOQUE
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              {isAdicionado && (
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="font-bold text-slate-200 text-xs">
                                    {item.fornecedor || rel.distribuidora}
                                  </span>
                                  <span className="text-[11px] text-emerald-400 font-bold">
                                    R$ {Number(item.preco_1 || 0).toFixed(2)}
                                  </span>
                                </div>
                              )}
                              {isRepassado && (
                                <div className="inline-flex items-center gap-1 text-xs">
                                  <span className="text-slate-400 line-through text-[11px]">
                                    {item.fornecedor_origem}
                                  </span>
                                  <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span className="font-black text-amber-300">
                                    {item.fornecedor_destino}
                                  </span>
                                  <span className="text-[11px] text-amber-200 font-bold ml-1">
                                    R$ {Number(item.preco_destino || 0).toFixed(2)}
                                  </span>
                                </div>
                              )}
                              {isSemEstoque && (
                                <span className="text-slate-400 text-xs italic">
                                  {item.fornecedor_origem} (Esgotado)
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right whitespace-nowrap font-black">
                              {isAdicionado && (
                                <span className="text-emerald-300">
                                  R$ {Number(item.subtotal || 0).toFixed(2)}
                                </span>
                              )}
                              {isRepassado && (
                                <span className="text-amber-300">
                                  R$ {Number(item.subtotal_destino || 0).toFixed(2)}
                                </span>
                              )}
                              {isSemEstoque && <span className="text-slate-500">—</span>}
                            </td>
                            {/* Preço de Última Compra */}
                            <td className="py-2 px-3 text-right whitespace-nowrap text-amber-300 font-bold">
                              {precoUlt > 0 ? (
                                <div>
                                  <span>R$ {precoUlt.toFixed(2)}</span>
                                  <span className="block text-[10px] text-slate-500 font-normal">
                                    Sub: R$ {(precoUlt * item.quantidade).toFixed(2)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            {/* Badge Economia / Diferença */}
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              {precoUlt > 0 ? (
                                difReais > 0 ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-600">
                                    -R$ {difReais.toFixed(2)} (-{Math.abs(varPct)}%)
                                  </span>
                                ) : difReais < 0 ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-950 text-rose-300 border border-rose-600">
                                    +R$ {Math.abs(difReais).toFixed(2)} (+{varPct}%)
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">Mesmo preço</span>
                                )
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap text-[11px] text-slate-300">
                              <span className="truncate max-w-[220px] block" title={item.motivo}>
                                {item.motivo || (isAdicionado ? 'Adicionado com sucesso no carrinho' : 'Não informado')}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {/* Totalizador Consolidado do Relatório com Economia Líquida */}
                  <tfoot className="bg-[#050a14] border-t-2 border-slate-700 font-bold text-xs sticky bottom-0 z-10 shadow-lg">
                    <tr className="border-b border-slate-800">
                      <td className="py-3 px-3 text-slate-200">
                        <div className="flex items-center gap-1.5 font-black uppercase text-[11px] text-cyan-300">
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Totais Consolidados</span>
                          <span className="text-slate-400 font-normal">({itensFiltrados.length} no filtro)</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center text-white font-black text-sm">
                        {itensFiltrados.reduce((acc: number, item: any) => acc + (Number(item.quantidade) || 0), 0)} un
                      </td>
                      <td colSpan={2} className="py-3 px-3 text-left">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-emerald-400 font-bold">
                            {rel.sucessos} no carrinho
                          </span>
                          <span className="text-slate-600">|</span>
                          <span className="text-amber-400 font-bold">
                            {rel.itensRepassados2Colocado?.length || 0} repassados
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap font-black text-sm text-emerald-300 bg-emerald-950/20">
                        R$ {Number(rel.totalAdicionadoReais || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-xs text-amber-300 bg-amber-950/10">
                        R$ {Number(rel.totalUltimaCompraReais || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {Number(rel.economiaTotalReais || 0) > 0 ? (
                          <div className="inline-flex flex-col items-center px-2 py-1 rounded-lg bg-emerald-950 border border-emerald-500 shadow-md">
                            <span className="text-[10px] text-emerald-400 font-black uppercase tracking-wider">Economia Líquida</span>
                            <span className="text-xs font-black text-emerald-200">
                              -R$ {Number(rel.economiaTotalReais || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-emerald-300 font-bold">
                              (-{Math.abs(Number(rel.economiaTotalPct || 0))}%)
                            </span>
                          </div>
                        ) : Number(rel.economiaTotalReais || 0) < 0 ? (
                          <div className="inline-flex flex-col items-center px-2 py-1 rounded-lg bg-rose-950 border border-rose-500 shadow-md">
                            <span className="text-[10px] text-rose-400 font-black uppercase tracking-wider">Gasto Adicional</span>
                            <span className="text-xs font-black text-rose-200">
                              +R$ {Math.abs(Number(rel.economiaTotalReais || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-rose-300 font-bold">
                              (+{Math.abs(Number(rel.economiaTotalPct || 0))}%)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs font-bold">Neutro (R$ 0,00)</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap text-[11px] text-slate-400 font-normal">
                        Auditado pelo BelaPed
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Rodapé Informativo e Ações */}
              <div className="p-4 px-6 bg-[#080d18] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>
                    Os itens repassados foram invalidados na cotação de origem e <b>já assumiram a liderança no banco</b> para compras no 2º colocado.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      carregarDados();
                      addToast('Lista de faltas atualizada com o novo ranking das distribuidoras!', 'info');
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 hover:text-white border border-cyan-500/40 text-xs font-bold transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Atualizar Tabela do Belinha</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalRelatorioAberto(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ─── MODAL DE AUDITORIA SEGURA DE PRAZOS DE BOLETOS E PEDIDOS MÍNIMOS ─── */}
      {modalAuditoriaAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0b1322] border border-indigo-700/80 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-950/80 via-slate-900 to-[#0a1220]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-900/60 border border-indigo-500 text-indigo-300">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Auditoria de Prazos de Boletos e Pedidos Mínimos
                  </h3>
                  <p className="text-xs text-indigo-200/80">
                    Simulação segura nos portais com Risco Zero (NUNCA finaliza pedidos reais e restaura os carrinhos intactos)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalAuditoriaAberta(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl bg-indigo-950/40 border border-indigo-900/60 text-xs">
                <div>
                  <span className="font-bold text-white block">Auditoria Automática Quinzenal</span>
                  <span className="text-slate-300 text-[11px]">
                    Executada a cada 15 dias para manter pedidos mínimos e prazos atualizados no sistema.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDispararAuditoriaPrazos()}
                  disabled={auditandoPrazos}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110 text-white font-black text-xs shadow-md transition-all cursor-pointer disabled:opacity-50 active:scale-95 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${auditandoPrazos ? 'animate-spin' : ''}`} />
                  <span>{auditandoPrazos ? 'Auditando em Segundo Plano...' : '⚡ Auditar Todas Agora'}</span>
                </button>
              </div>

              {/* Tabela de Portais e Prazos Detectados */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#070e1a] text-slate-400 text-[11px] uppercase font-bold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Distribuidora</th>
                      <th className="py-2.5 px-3 text-center">Pedido Mínimo</th>
                      <th className="py-2.5 px-3">Prazos de Boleto Detectados</th>
                      <th className="py-2.5 px-3 text-center">Última Checagem</th>
                      <th className="py-2.5 px-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-[#060c18]">
                    {portais.map(portal => (
                      <tr key={portal.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-white flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${portal.is_ativo ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                          <span>{portal.nome}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-cyan-300">
                          R$ {Number(portal.pedido_minimo || 300).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-indigo-300 font-bold bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60 inline-block">
                            💳 {portal.prazos_boleto || `${portal.prazo_dias_padrao || 28} DDL`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-400 text-[11px]">
                          {portal.data_ultima_auditoria
                            ? new Date(portal.data_ultima_auditoria).toLocaleDateString('pt-BR')
                            : 'Padrão'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDispararAuditoriaPrazos(portal.id)}
                            disabled={auditandoPrazos}
                            className="p-1 px-2 rounded-lg bg-slate-800 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-slate-700 text-[10px] font-bold transition-colors cursor-pointer"
                            title={`Rodar simulação segura apenas na ${portal.nome}`}
                          >
                            Simular
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 border-t border-slate-800 bg-[#070e1a] flex justify-end">
              <button
                type="button"
                onClick={() => setModalAuditoriaAberta(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE GESTÃO DE CAMPANHAS COMERCIAIS DA DISTRIMED ─── */}
      {modalCampanhasAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0b1322] border border-amber-700/80 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-950/80 via-slate-900 to-[#0a1220]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-900/60 border border-amber-500 text-amber-300">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Campanhas e Condições Comerciais - Distrimed
                  </h3>
                  <p className="text-xs text-amber-200/80">
                    Configure as opções da modal de condições de preços (Unilever, Nívea, Dapa, Solar, Nestlé, etc.)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalCampanhasAberta(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4">
              {/* Formulário de Adicionar / Editar Campanha */}
              <div className="p-3.5 rounded-xl bg-[#08101d] border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-amber-300 block">
                  {formCampanha.id ? 'Editar Campanha da Distrimed' : 'Cadastrar / Ajustar Campanha'}
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Nome exato na modal da Distrimed:</label>
                    <input
                      type="text"
                      value={formCampanha.nome_opcao}
                      onChange={(e) => setFormCampanha(prev => ({ ...prev, nome_opcao: e.target.value }))}
                      placeholder="Ex: NIVEA 14/10 E 15/10, PHARMALINK - UNILEVER"
                      className="w-full bg-[#060c18] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Palavras-chave (separadas por vírgula):</label>
                    <input
                      type="text"
                      value={formCampanha.termos_busca}
                      onChange={(e) => setFormCampanha(prev => ({ ...prev, termos_busca: e.target.value }))}
                      placeholder="Ex: NIVEA, DOVE, REXONA, DAPAGLIFLOZINA"
                      className="w-full bg-[#060c18] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Pedido Mínimo da Campanha (R$):</label>
                    <input
                      type="number"
                      value={formCampanha.minimo_valor || ''}
                      onChange={(e) => setFormCampanha(prev => ({ ...prev, minimo_valor: parseFloat(e.target.value) || 0 }))}
                      placeholder="0 para sem mínimo"
                      className="w-full bg-[#060c18] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Qtd Mínima de Unidades (se houver):</label>
                    <input
                      type="number"
                      value={formCampanha.minimo_qtd || ''}
                      onChange={(e) => setFormCampanha(prev => ({ ...prev, minimo_qtd: parseInt(e.target.value) || 0 }))}
                      placeholder="Ex: 24 ou 112 un (DAPA)"
                      className="w-full bg-[#060c18] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  {formCampanha.id && (
                    <button
                      type="button"
                      onClick={() => setFormCampanha({ id: null, nome_opcao: '', termos_busca: '', minimo_valor: 0, minimo_qtd: 0, ativo: 1 })}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSalvarCampanhaDistrimed}
                    disabled={salvandoCampanha}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{salvandoCampanha ? 'Salvando...' : (formCampanha.id ? 'Atualizar Campanha' : 'Salvar Nova Campanha')}</span>
                  </button>
                </div>
              </div>

              {/* Lista de Campanhas Cadastradas */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#070e1a] text-slate-400 text-[11px] uppercase font-bold border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">Opção Comercial (Modal Distrimed)</th>
                      <th className="py-2 px-3">Palavras-chave</th>
                      <th className="py-2 px-3 text-center">Mín. Valor</th>
                      <th className="py-2 px-3 text-center">Mín. Qtd</th>
                      <th className="py-2 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-[#060c18]">
                    {campanhasDistrimed.map(c => (
                      <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 font-bold text-white">
                          🏷️ {c.nome_opcao}
                        </td>
                        <td className="py-2 px-3 text-slate-300 font-mono text-[11px] truncate max-w-[200px]" title={c.termos_busca}>
                          {c.termos_busca}
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-emerald-400">
                          {c.minimo_valor > 0 ? `R$ ${c.minimo_valor.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-cyan-300">
                          {c.minimo_qtd > 0 ? `${c.minimo_qtd} un` : '—'}
                        </td>
                        <td className="py-2 px-3 text-right space-x-1">
                          <button
                            type="button"
                            onClick={() => setFormCampanha(c)}
                            className="p-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold cursor-pointer"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoverCampanhaDistrimed(c.id)}
                            className="p-1 px-1.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 text-[10px] cursor-pointer"
                            title="Remover campanha"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 border-t border-slate-800 bg-[#070e1a] flex justify-end">
              <button
                type="button"
                onClick={() => setModalCampanhasAberta(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 1.1 MODAL UNIFICADA "VER CARRINHOS" COM GUIAS (ABAS) DE CADA EMPRESA COTADA ─── */}
      {carrinhoModalAberto && carrinhosOtimizados.length > 0 && (() => {
        const idxSeguro = Math.min(abaEmpresaModalIndex, carrinhosOtimizados.length - 1);
        const carrinhoAtivo = carrinhosOtimizados[idxSeguro] || carrinhoModalSelecionado || carrinhosOtimizados[0];
        if (!carrinhoAtivo) return null;

        const portalCad = portais.find(p => p.nome.toUpperCase() === carrinhoAtivo.distribuidora.toUpperCase());
        const opcoesPrazos = portalCad?.prazos_boleto 
          ? portalCad.prazos_boleto.split(' | ') 
          : [carrinhoAtivo.boletoEleito || `${carrinhoAtivo.prazoDias} DDL`];
        const estaComprando = comprandoDireto && distribuidoraComprando === carrinhoAtivo.distribuidora;
        const isDistrimed = carrinhoAtivo.distribuidora.toUpperCase().includes('DISTRIMED');
        const totalGeralCarrinhos = carrinhosOtimizados.reduce((acc, c) => acc + (Number(c.total) || 0), 0);
        const totalItensGeral = carrinhosOtimizados.reduce((acc, c) => acc + (c.itens?.length || 0), 0);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#0b1320] border-2 border-slate-700/90 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-cyan-500/30">
              {/* Top Header Global da Modal Unificada */}
              <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-[#070e1a] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-950/90 border border-cyan-600/80 text-cyan-300 shadow-md">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base sm:text-lg font-black uppercase text-white tracking-wide">
                        🛒 Central de Carrinhos Otimizados ({carrinhosOtimizados.length} Empresas)
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-cyan-950 text-cyan-300 border border-cyan-700">
                        {totalItensGeral} itens • Total: R$ {totalGeralCarrinhos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      {itensRepassados.length > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700">
                          🔄 {itensRepassados.length} repassados p/ atingir mínimo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Alterne entre as guias de cada distribuidora para montar o carrinho, passar itens para o 2º colocado, excluir produtos ou confirmar a compra lançando em Pedidos.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleMontarTodosCarrinhos}
                    disabled={montandoTodosCarrinhos}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    title="Limpar e montar automaticamente os carrinhos reais em todas as distribuidoras"
                  >
                    {montandoTodosCarrinhos ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Montando Todos...</span>
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>🤖 Montar Todos os Carrinhos</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExecutarSimulacao(false)}
                    disabled={simulando}
                    className="px-3 py-1.5 rounded-xl bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 border border-indigo-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    title="Re-otimizar carrinhos dissolvendo empresas abaixo do pedido mínimo"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${simulando ? 'animate-spin' : 'text-amber-300'}`} />
                    <span>Re-otimizar Mínimos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCarrinhoModalAberto(false);
                      handleIniciarWizardComprarTodos();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5 text-yellow-300" />
                    <span>Comprar Todos (Passo a Passo)</span>
                  </button>

                  <button 
                    onClick={() => setCarrinhoModalAberto(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer ml-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Barra de Guias (Abas) de Cada Empresa Cotada */}
              <div className="bg-[#09101d] border-b border-slate-800 px-3 pt-2.5 flex items-center gap-1.5 overflow-x-auto">
                {carrinhosOtimizados.map((car: any, idx: number) => {
                  const isAtiva = idx === idxSeguro;
                  const atingiu = car.atingiuMinimo;
                  return (
                    <button
                      key={car.distribuidora}
                      type="button"
                      onClick={() => {
                        setAbaEmpresaModalIndex(idx);
                        setCarrinhoModalSelecionado(car);
                        setPrazoSelecionadoModal(car.boletoEleito || `${car.prazoDias} DDL`);
                      }}
                      className={`px-3.5 py-2 rounded-t-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 border-t-2 border-x whitespace-nowrap ${
                        isAtiva
                          ? 'bg-[#0b1320] text-white border-t-cyan-400 border-x-slate-700 shadow-lg'
                          : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border-t-transparent border-x-slate-800/60'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${atingiu ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                      <span>{car.distribuidora}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-cyan-300 font-mono">
                        {car.itens?.length || 0}
                      </span>
                      <span className={`text-[11px] font-extrabold ${atingiu ? 'text-emerald-300' : 'text-amber-300'}`}>
                        R$ {Number(car.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Sub-header da Empresa Selecionada: Status do Pedido Mínimo + Prazo Eleito + Regra Distrimed */}
              <div className="p-3.5 bg-gradient-to-r from-slate-900 via-[#0d1726] to-slate-900 border-b border-slate-800 flex flex-col gap-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-black uppercase text-white tracking-wide flex items-center gap-1.5">
                      🏢 {carrinhoAtivo.distribuidora}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                      carrinhoAtivo.atingiuMinimo 
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' 
                        : 'bg-amber-950 text-amber-300 border border-amber-700'
                    }`}>
                      {carrinhoAtivo.atingiuMinimo 
                        ? `✅ Mínimo Atingido (Mín: R$ ${Number(carrinhoAtivo.pedidoMinimo || 0).toFixed(2)})` 
                        : `⚠️ Falta R$ ${Number(carrinhoAtivo.faltaParaMinimo || 0).toFixed(2)} p/ Mínimo de R$ ${Number(carrinhoAtivo.pedidoMinimo || 0).toFixed(2)}`}
                    </span>
                    <span className="text-xs text-slate-300 font-bold">
                      Total na {carrinhoAtivo.distribuidora}: <b className="text-cyan-300 text-sm">R$ {Number(carrinhoAtivo.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                    </span>
                  </div>

                  {/* Seletor de Prazo e Data do Boleto */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                      Prazo do Boleto:
                    </span>
                    <select
                      value={prazoSelecionadoModal}
                      onChange={(e) => setPrazoSelecionadoModal(e.target.value)}
                      className="bg-slate-900 border-2 border-emerald-500/80 rounded-xl px-2.5 py-1 text-xs font-black text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-md"
                    >
                      {opcoesPrazos.map((pOpt: string, pIdx: number) => {
                        const dataVenc = formatarPrazoComDataVencimento(pOpt);
                        return (
                          <option key={pIdx} value={pOpt} className="bg-slate-900 text-slate-200">
                            💳 {pOpt} {dataVenc ? `• (Venc: ${dataVenc})` : ''}
                          </option>
                        );
                      })}
                    </select>

                    {prazoSelecionadoModal && formatarPrazoComDataVencimento(prazoSelecionadoModal) && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-950/80 border border-emerald-700/80 text-[11px] font-bold text-emerald-300 whitespace-nowrap">
                        <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Vencimento: <b className="text-white">{formatarPrazoComDataVencimento(prazoSelecionadoModal)}</b></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Painel Especial Regra de Negócio DISTRIMED (Boletos até R$ 250 / Máx 60 Dias / Dias de Menor Despesa) */}
                {isDistrimed && (carrinhoAtivo.distrimedPlanoInteligente || (carrinhoAtivo.parcelasCalculadas && carrinhoAtivo.parcelasCalculadas.length > 0)) && (
                  <div className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-emerald-950/70 border border-indigo-600/60 flex flex-col gap-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-black uppercase">
                          🎯 Regra Distrimed Ativa
                        </span>
                        <span className="text-xs font-bold text-indigo-200">
                          Escolha de Vencimentos • Máx 60 Dias • Boletos até R$ 250,00 alocados nos dias úteis de menor despesa do caixa:
                        </span>
                      </div>
                      <span className="text-[11px] font-black text-emerald-300">
                        {carrinhoAtivo.parcelasCalculadas?.length || 1}x boleto(s) planejado(s)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {(carrinhoAtivo.parcelasCalculadas || []).map((parc: any, pIdx: number) => (
                        <div key={pIdx} className="p-2 rounded-lg bg-slate-950/90 border border-indigo-800/70 flex flex-col justify-between text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-indigo-300">{parc.numero || pIdx + 1}ª Parcela ({parc.prazoDias} DDL)</span>
                            <span className="font-black text-emerald-400">R$ {Number(parc.valor || 0).toFixed(2)}</span>
                          </div>
                          <div className="text-[10px] text-slate-300 mt-1 flex items-center justify-between">
                            <span>📅 Venc: <b className="text-white">{parc.dataVencimentoBR || parc.dataVencimento}</b></span>
                            {parc.despesaExistenteNoDia !== undefined && (
                              <span className="text-cyan-300" title="Total de boletos/despesas já existentes neste dia">
                                Caixa dia: R$ {Number(parc.despesaExistenteNoDia || 0).toFixed(0)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tabela de Produtos da Guia Ativa com Ações de Passar p/ 2º Colocado e Excluir */}
              <div className="p-3.5 overflow-y-auto flex-1">
                {(!carrinhoAtivo.itens || carrinhoAtivo.itens.length === 0) ? (
                  <div className="py-12 text-center text-slate-400 text-sm">
                    Nenhum produto neste carrinho.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] uppercase font-black text-slate-400">
                        <th className="pb-2 whitespace-nowrap">EAN / Produto</th>
                        <th className="pb-2 text-center whitespace-nowrap">Qtd</th>
                        <th className="pb-2 text-right whitespace-nowrap">Preço Un.</th>
                        <th className="pb-2 text-right whitespace-nowrap">Subtotal</th>
                        <th className="pb-2 text-left pl-4 whitespace-nowrap">2º Colocado (Alternativa)</th>
                        <th className="pb-2 text-right whitespace-nowrap">Ações no Item</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {carrinhoAtivo.itens.map((it: any, iIdx: number) => {
                        const segForn = it.segundoFornecedor || it.segundoColocado || '';
                        const segPreco = Number(it.segundoPreco || it.precoSegundoColocado || 0);
                        const temSegundo = Boolean(segForn && segForn !== '—' && segPreco > 0);
                        const diffSegundo = temSegundo ? (segPreco - Number(it.precoUnitario)) : 0;
                        return (
                          <tr key={it.ean || iIdx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-2.5 pr-2">
                              <span className="font-bold text-white block">{it.descricao}</span>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="font-mono text-[10px] text-slate-400">{it.ean || '—'}</span>
                                {it.repassado && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[9px] font-black" title={it.motivoRepasse}>
                                    🔄 Ex-{it.repassadoDe}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-white whitespace-nowrap">
                              {it.quantidade} un
                            </td>
                            <td className="py-2.5 px-2 text-right font-medium text-slate-300 whitespace-nowrap">
                              R$ {Number(it.precoUnitario || 0).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-black text-emerald-400 whitespace-nowrap">
                              R$ {Number(it.subtotal || 0).toFixed(2)}
                            </td>
                            <td className="py-2.5 pl-4 pr-2 whitespace-nowrap">
                              {temSegundo ? (
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-bold text-cyan-300">
                                    {segForn} • R$ {segPreco.toFixed(2)}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {diffSegundo >= 0 ? `+R$ ${diffSegundo.toFixed(2)}/un` : `-R$ ${Math.abs(diffSegundo).toFixed(2)}/un`}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-500 italic">Sem 2º colocado cotado</span>
                              )}
                            </td>
                            <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handlePassarItemParaSegundoColocadoModal(carrinhoAtivo.distribuidora, it)}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-950/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/80 text-[10px] font-black transition-colors cursor-pointer flex items-center gap-1"
                                  title={temSegundo ? `Passar este produto para ${segForn} (R$ ${segPreco.toFixed(2)})` : 'Escolher outra distribuidora cotada para este item'}
                                >
                                  <ArrowRight className="w-3 h-3 text-cyan-300" />
                                  <span>Passar p/ 2º</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleExcluirItemDoCarrinhoModal(carrinhoAtivo.distribuidora, it)}
                                  className="px-2 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-800 text-rose-300 border border-rose-800/80 text-[10px] font-black transition-colors cursor-pointer flex items-center gap-1"
                                  title="Excluir este item do carrinho"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Excluir</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer da Guia Ativa: Montar Carrinho no Portal, Abrir Portal, Lançar em Pedidos ou Comprar Direto */}
              <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-[#070e1a] flex flex-col lg:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-full lg:w-auto justify-between lg:justify-start">
                  <button
                    type="button"
                    onClick={() => setCarrinhoModalAberto(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Fechar
                  </button>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    Ao confirmar a compra, o pedido e os boletos são lançados automaticamente na guia <b className="text-cyan-300">Pedidos</b> do Belinha.
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 w-full lg:w-auto">
                  <button
                    type="button"
                    onClick={() => handleMontarCarrinhoDaAbaModal(carrinhoAtivo)}
                    disabled={montandoTodosCarrinhos}
                    className="px-3.5 py-2 rounded-xl bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-700 text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    title="Enviar estes itens para o carrinho real do portal via robô"
                  >
                    <ShoppingCart className={`w-3.5 h-3.5 ${montandoTodosCarrinhos ? 'animate-bounce' : 'text-cyan-400'}`} />
                    <span>{montandoTodosCarrinhos ? 'Montando...' : `Montar Carrinho (${carrinhoAtivo.distribuidora})`}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAbrirNavegadorCarrinho(carrinhoAtivo)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer border border-slate-700 flex items-center gap-1.5"
                    title="Abrir a janela do portal com o carrinho para conferência"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir Portal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleConfirmarELancarPedidoModal(carrinhoAtivo, prazoSelecionadoModal)}
                    disabled={lancandoPedidoBelinha}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    title="Confirmar que a compra foi realizada e lançar imediatamente na guia Pedidos do Belinha com os vencimentos calculados"
                  >
                    <CheckCircle2 className="w-4 h-4 text-indigo-200" />
                    <span>
                      {lancandoPedidoBelinha
                        ? 'Lançando em Pedidos...'
                        : 'Confirmar Compra & Lançar em Pedidos'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await handleComprarCarrinhoDireto(carrinhoAtivo, prazoSelecionadoModal);
                    }}
                    disabled={estaComprando}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-lg shadow-emerald-950/40 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    title="Executar compra pelo robô no portal e lançar automaticamente na guia Pedidos"
                  >
                    {estaComprando ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Comprando no Portal...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-yellow-300" />
                        <span>Comprar pelo Robô ({prazoSelecionadoModal})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── 1.3 WIZARD ASSISTIDO "COMPRAR TODOS" (CONFIRMAR UM POR UM) ─── */}
      {wizardComprarTodosAberto && carrinhosOtimizados.length > 0 && (() => {
        const carrinhoAtual = carrinhosOtimizados[wizardEtapaAtual];
        if (!carrinhoAtual) return null;

        const totalEtapas = carrinhosOtimizados.length;
        const portalCad = portais.find(p => p.nome.toUpperCase() === carrinhoAtual.distribuidora.toUpperCase());
        const opcoesPrazos = portalCad?.prazos_boleto 
          ? portalCad.prazos_boleto.split(' | ') 
          : [carrinhoAtual.boletoEleito || `${carrinhoAtual.prazoDias} DDL`];
        const prazoAtual = wizardPrazosPorDist[carrinhoAtual.distribuidora] || carrinhoAtual.boletoEleito || (carrinhoAtual.prazoDias + ' DDL');
        const estaComprando = comprandoDireto && distribuidoraComprando === carrinhoAtual.distribuidora;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-[#0b1320] border-2 border-emerald-600/80 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden ring-2 ring-emerald-500/30">
              {/* Header do Wizard */}
              <div className="p-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-[#070e1a] to-emerald-950/60 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 uppercase tracking-wider">
                      Etapa {wizardEtapaAtual + 1} de {totalEtapas}
                    </span>
                    <span className="text-xs text-slate-400">Assistente de Compra BelaPed</span>
                  </div>
                  <h2 className="text-lg font-black text-white uppercase mt-1 flex items-center gap-2">
                    <span>{carrinhoAtual.distribuidora}</span>
                    <span className="text-cyan-300">• R$ {carrinhoAtual.total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </h2>
                </div>

                <button 
                  onClick={() => setWizardComprarTodosAberto(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                  title="Cancelar assistente"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Barra de Progresso das Etapas */}
              <div className="w-full bg-slate-900 h-1.5">
                <div 
                  className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-1.5 transition-all duration-300"
                  style={{ width: `${Math.round(((wizardEtapaAtual + 1) / totalEtapas) * 100)}%` }}
                />
              </div>

              {/* Painel do Prazo Orçamentário */}
              <div className="p-4 bg-[#0e1626] border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-white uppercase block">
                      Condição de Pagamento & Prazo no Boleto
                    </span>
                    <span className="text-xs text-slate-400">
                      Calculado automaticamente com base no saldo orçamentário da farmácia:
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <select
                    value={prazoAtual}
                    onChange={(e) => {
                      const novoP = e.target.value;
                      setWizardPrazosPorDist(prev => ({ ...prev, [carrinhoAtual.distribuidora]: novoP }));
                    }}
                    className="bg-slate-900 border-2 border-emerald-500/70 rounded-xl px-3 py-2 text-xs font-black text-emerald-300 focus:outline-none cursor-pointer shadow-md"
                  >
                    {opcoesPrazos.map((pOpt: string, pIdx: number) => {
                      const dataVenc = formatarPrazoComDataVencimento(pOpt);
                      return (
                        <option key={pIdx} value={pOpt} className="bg-slate-900 text-slate-200">
                          💳 {pOpt} {dataVenc ? `• (Venc: ${dataVenc})` : ''}
                        </option>
                      );
                    })}
                  </select>

                  {prazoAtual && formatarPrazoComDataVencimento(prazoAtual) && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-700/80 text-[11px] font-bold text-emerald-300 whitespace-nowrap shadow-sm">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Data do Boleto: <b className="text-white">{formatarPrazoComDataVencimento(prazoAtual)}</b></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tabela dos Produtos desta Distribuidora */}
              <div className="p-4 overflow-y-auto flex-1 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 pb-1 border-b border-slate-800">
                  <span>Produtos selecionados ({carrinhoAtual.itens?.length || 0} itens)</span>
                  <span>Mínimo: R$ {carrinhoAtual.pedidoMinimo?.toFixed(2)} • {carrinhoAtual.atingiuMinimo ? '✅ Atingido' : '⚠️ Abaixo do mínimo'}</span>
                </div>

                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 text-[10px] uppercase font-bold text-slate-500">
                      <th className="py-2">Item</th>
                      <th className="py-2 text-center">Qtd</th>
                      <th className="py-2 text-right">Preço</th>
                      <th className="py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {carrinhoAtual.itens?.map((it: any, itIdx: number) => (
                      <tr key={itIdx} className="hover:bg-slate-800/30">
                        <td className="py-2 pr-2">
                          <span className="font-bold text-white block">{it.descricao}</span>
                          <span className="font-mono text-[10px] text-slate-400">{it.ean}</span>
                          {it.repassado && (
                            <span className="ml-2 text-[9px] text-amber-300 font-bold bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-800">
                              Repassado de {it.repassadoDe}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-white">{it.quantidade} un</td>
                        <td className="py-2 px-2 text-right text-slate-300">R$ {it.precoUnitario?.toFixed(2)}</td>
                        <td className="py-2 pl-2 text-right font-black text-cyan-300">R$ {it.subtotal?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Rodapé com Navegação / Confirmação */}
              <div className="p-4 border-t border-slate-800 bg-[#070e1a] flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setWizardComprarTodosAberto(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-bold transition-colors cursor-pointer w-full sm:w-auto"
                >
                  Cancelar
                </button>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  {/* Botão de Pular */}
                  <button
                    type="button"
                    onClick={() => {
                      if (wizardEtapaAtual + 1 < totalEtapas) {
                        setWizardEtapaAtual(prev => prev + 1);
                      } else {
                        setWizardComprarTodosAberto(false);
                        addToast('Assistente finalizado!', 'info');
                      }
                    }}
                    disabled={estaComprando}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer border border-slate-700 flex items-center gap-1.5"
                  >
                    <span>⏭️ Pular esta Distribuidora</span>
                  </button>

                  {/* Botão de Confirmar e Comprar */}
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await handleComprarCarrinhoDireto(carrinhoAtual, prazoAtual);
                      if (res) {
                        setWizardHistoricoResultados(prev => [...prev, res]);
                        if (wizardEtapaAtual + 1 < totalEtapas) {
                          setWizardEtapaAtual(prev => prev + 1);
                        } else {
                          setWizardComprarTodosAberto(false);
                          addToast('Todas as compras do assistente foram processadas com sucesso!', 'success');
                        }
                      }
                    }}
                    disabled={estaComprando}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-lg shadow-emerald-950/50 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
                  >
                    {estaComprando ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Comprando na {carrinhoAtual.distribuidora}...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Confirmar e Comprar na {carrinhoAtual.distribuidora}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
            onDispararRobo={(fornecedor = 'TODOS', lote = 40, prio = 'TODOS') => handleIniciarCotacaoAoVivo(fornecedor, lote, prio)}
            onDadosAtualizados={() => carregarDados(true)}
            modoDiscreto={activeTab === 'decisao'}
          />
        );
      })()}

      {/* ─── TOAST NOTIFICAÇÃO DE CÓPIA DO EAN ─── */}
      {toastCopiado && (
        <div className="fixed bottom-6 left-6 z-50 px-4 py-3 rounded-2xl bg-emerald-950/95 text-emerald-200 text-xs font-black shadow-2xl flex items-center gap-2.5 border border-emerald-500/80 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastCopiado}</span>
        </div>
      )}

      {/* ─── MODAL DE VERSÕES & CHANGELOG ─── */}
      <VersionModal
        isOpen={versionModalOpen}
        onClose={() => setVersionModalOpen(false)}
      />

    </div>
  );
};
