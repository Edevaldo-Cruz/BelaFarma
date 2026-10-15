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
  Check,
  Copy
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
  nao_cotar?: boolean;
  nao_carrinho?: boolean;
  motivo_justificativa?: string;
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
  const [filtroRegras, setFiltroRegras] = useState<'TODOS' | 'BLOQUEADOS_CARRINHO' | 'NAO_COTAR' | 'LIBERADOS'>('TODOS');
  const [justificativaEditando, setJustificativaEditando] = useState<{ [id: number]: string }>({});
  const [copiadoEan, setCopiadoEan] = useState<string | null>(null);

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

  // Atualizar Regra de Produto (Não colocar no carrinho, Não cotar e Justificativa)
  const handleAtualizarRegraProduto = async (
    item: FaltaItem7d,
    campo: 'nao_cotar' | 'nao_carrinho' | 'motivo_justificativa',
    valor: any
  ) => {
    const novaRegra = {
      nao_cotar: campo === 'nao_cotar' ? Boolean(valor) : Boolean(item.nao_cotar),
      nao_carrinho: campo === 'nao_carrinho' ? Boolean(valor) : Boolean(item.nao_carrinho),
      motivo_justificativa: campo === 'motivo_justificativa' ? String(valor) : String(item.motivo_justificativa || '')
    };

    // Atualização otimista no estado local imediato
    setFaltas(prev => prev.map(f => {
      if (f.produto_id === item.produto_id || (f.ean && f.ean === item.ean)) {
        return { ...f, ...novaRegra };
      }
      return f;
    }));

    // Se marcou para não colocar no carrinho, desmarca da seleção de compra
    if (campo === 'nao_carrinho' && valor === true) {
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
        }
      }
    } catch (e: any) {
      console.error('Erro ao sincronizar regra:', e);
      addToast('Erro ao salvar regra: ' + e.message, 'error');
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
  const [filtroCurva, setFiltroCurva] = useState<'TODAS' | 'A' | 'B' | 'C' | 'ESQUECIDOS_6M'>('TODAS');
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

  // Re-cotação imediata com o robô quando houver divergência de preço vs última compra
  const [recotandoEan, setRecotandoEan] = useState<string | null>(null);

  const handleRecotarProduto = async (item: FaltaItem7d) => {
    if (!item.ean) return;
    setRecotandoEan(item.ean);
    try {
      const fornecedorAlvo = item.fornecedor_1 && item.fornecedor_1 !== 'Não Cotado' && !item.fornecedor_1.includes('Sem Estoque')
        ? item.fornecedor_1
        : 'TODOS';
      const res = await fetch('/api/belaped/recotar-produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ean: item.ean,
          fornecedor: fornecedorAlvo,
          descricao: item.descricao
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Robô re-executado com sucesso para ${item.descricao}!`, 'success');
        carregarDados();
      } else {
        addToast(data.error || 'Erro ao recotar produto.', 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação com o robô: ' + err.message, 'error');
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

      // Cálculo resiliente da Prioridade (garante que P1, P2, P3 e P4 nunca sejam 0 ou undefined)
      const isCurvaAlta = item.curva_abc === 'A' || item.curva_abc === 'B';
      const diasCobertura = vmd > 0 && saldoFisico > 0 ? (saldoFisico / vmd) : 0;
      let prioridadeFinal: 'P1' | 'P2' | 'P3' | 'P4' = (item.prioridade as any) || 'P4';
      let prioridadeRotuloFinal: string = item.prioridade_rotulo || 'Regular';

      if (!item.prioridade || item.prioridade === 'P4') {
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

  // Relatório de Auditoria e Repasse do Carrinho do Robô
  const [modalRelatorioAberto, setModalRelatorioAberto] = useState(false);
  const [ultimoRelatorioAuditoria, setUltimoRelatorioAuditoria] = useState<any | null>(null);
  const [abaRelatorioAuditoria, setAbaRelatorioAuditoria] = useState<'TODOS' | 'ADICIONADOS' | 'REPASSADOS' | 'SEM_ESTOQUE'>('TODOS');
  const [buscaRelatorioAuditoria, setBuscaRelatorioAuditoria] = useState('');

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
        setFaltasBalcaoBelinha(dataFaltas.faltas_balcao_belinha_lista || []);
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
      // Filtro de Regras de Produtos (Bloqueados para Carrinho, Não Cotar ou Liberados)
      if (filtroRegras === 'BLOQUEADOS_CARRINHO' && !f.nao_carrinho) {
        return false;
      }
      if (filtroRegras === 'NAO_COTAR' && !f.nao_cotar) {
        return false;
      }
      if (filtroRegras === 'LIBERADOS' && (f.nao_carrinho || f.nao_cotar)) {
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
      'PROFARMA': 400,
      'SOTON FARMA': 300,
      'DPC DISTRIBUIDORA': 300,
      'DIVIMED': 400,
      'MARTINS ATACADO': 200,
      'MARTINS': 200
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
  }, [filtroCurva, filtroPrioridade, filtroCategoria, filtroDistribuidora, buscaFalta, itensPorPagina]);

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

  // Iniciar Cotação ao Vivo com o Robô Puppeteer (Profarma / DPC / Soton / Distrimed / Divimed / Todas)
  const handleIniciarCotacaoAoVivo = async (
    fornecedor: 'PROFARMA' | 'DPC' | 'SOTON' | 'DISTRIMED' | 'DIVIMED' | 'TODOS' = 'TODOS',
    tamanhoLote: number = 40,
    prioridadeFiltro?: 'P1' | 'P2' | 'P3' | 'TODAS_PRIORITARIAS',
    eansEspecificos?: string[]
  ) => {
    try {
      setCotandoAoVivo(true);

      const limiteReal = Math.max(10, Math.min(200, tamanhoLote || 40));

      let eansParaCotar: string[] = [];
      if (Array.isArray(eansEspecificos) && eansEspecificos.length > 0) {
        eansParaCotar = eansEspecificos;
      } else {
        // Ordenação estrita por Matriz de Gravidade Operacional (P1 Ruptura -> P2 Risco -> P3 Orçamento -> P4 Regular)
        const pesoPrio: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
        const itensOrdenadosPorPrio = [...faltasFiltradas]
          .filter(s => s.ean && s.ean.length >= 7)
          .filter(s => {
            if (prioridadeFiltro && prioridadeFiltro !== 'TODAS_PRIORITARIAS') {
              return s.prioridade === prioridadeFiltro;
            }
            return true;
          })
          .sort((a, b) => {
            const pa = pesoPrio[a.prioridade || 'P4'] || 4;
            const pb = pesoPrio[b.prioridade || 'P4'] || 4;
            if (pa !== pb) return pa - pb;
            const aNaoCotado = (!a.fornecedor_1 || a.fornecedor_1 === 'Não Cotado') ? 0 : 1;
            const bNaoCotado = (!b.fornecedor_1 || b.fornecedor_1 === 'Não Cotado') ? 0 : 1;
            return aNaoCotado - bNaoCotado;
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

      const rotuloPrioridade = prioridadeFiltro && prioridadeFiltro !== 'TODAS_PRIORITARIAS' ? `[${prioridadeFiltro}] ` : '';
      const nomeExibicao = fornecedor === 'TODOS' ? '5 Portais (Profarma, DPC, Soton, Distrimed e Divimed)' : fornecedor;

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
          prioridade: prioridadeFiltro !== 'TODAS_PRIORITARIAS' ? prioridadeFiltro : undefined
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

    return (
      <div
        key={item.produto_id}
        className={`flex flex-col justify-between rounded-2xl border transition-all duration-200 p-4 shadow-lg relative ${
          isBloqueadoCarrinho
            ? 'bg-[#151016] border-amber-600/70 shadow-amber-950/20 ring-1 ring-amber-500/30'
            : isNaoCotar
            ? 'bg-[#180e14] border-rose-600/70 shadow-rose-950/20 ring-1 ring-rose-500/30'
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
            </div>
          </div>

          {/* Nome do Produto e Apresentação */}
          <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug hover:text-cyan-300 transition-colors" title={item.descricao}>
            {item.descricao}
          </h3>

          <div className="flex items-center justify-between text-xs text-slate-400 mt-1 mb-3">
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
          <div className="grid grid-cols-4 gap-1.5 bg-[#070e1c] p-2 rounded-xl border border-slate-800/80 mb-3 text-center">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Saldo</span>
              <span className={`text-xs font-black ${isRuptura ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`}>
                {item.saldo} un
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Cobert.</span>
              <span className={`text-xs font-bold ${item.dias_estoque_restante <= 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                {item.dias_estoque_restante <= 0 ? '0d' : `${item.dias_estoque_restante}d`}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">VMD</span>
              <span className="text-xs font-bold text-slate-200">
                {item.vmd_ponderado}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">30 Dias</span>
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
              </div>

              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-black text-emerald-300">
                    {preco1 !== null ? `R$ ${preco1.toFixed(2)}` : '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setModalHistoricoPreco({ isOpen: true, produto: item })}
                    className="p-1 rounded bg-[#06101f] text-cyan-400 hover:text-white border border-cyan-800/80 transition-colors"
                    title="Ver série temporal e compras reais"
                  >
                    <LineChart className="w-3 h-3" />
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
          </div>
        </div>

        {/* RODAPÉ DO CARD: REGRAS DE DECISÃO E JUSTIFICATIVA (SOLICITADO PELO USUÁRIO) */}
        <div className="pt-2.5 border-t border-slate-800/80 space-y-2 mt-auto">
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Opção 1: Não colocar no carrinho */}
            <label className={`flex items-center gap-1.5 p-1.5 rounded-xl border cursor-pointer transition-all select-none ${
              isBloqueadoCarrinho
                ? 'bg-amber-950/80 border-amber-500 text-amber-200 font-black shadow-sm'
                : 'bg-[#060c18] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}>
              <input
                type="checkbox"
                checked={isBloqueadoCarrinho}
                onChange={(e) => handleAtualizarRegraProduto(item, 'nao_carrinho', e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
              <span className="text-[11px] leading-tight">🚫 Não colocar no carrinho</span>
            </label>

            {/* Opção 2: Não cotar */}
            <label className={`flex items-center gap-1.5 p-1.5 rounded-xl border cursor-pointer transition-all select-none ${
              isNaoCotar
                ? 'bg-rose-950/80 border-rose-500 text-rose-200 font-black shadow-sm'
                : 'bg-[#060c18] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}>
              <input
                type="checkbox"
                checked={isNaoCotar}
                onChange={(e) => handleAtualizarRegraProduto(item, 'nao_cotar', e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500 cursor-pointer"
              />
              <span className="text-[11px] leading-tight">🛑 Não cotar</span>
            </label>
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

          {/* Botão de Exibir Apenas a Tabela no Header */}
          <button
            onClick={alternarModoApenasTabela}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-md cursor-pointer border ${
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold transition-all shadow-md cursor-pointer"
            title="Exportar produtos em arquivo TXT separado por categorias e fornecedor"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Exportar TXT</span>
          </button>

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
      {!modoApenasTabela && (
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
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-5 bg-gradient-to-b from-[#070b14] via-[#09101f] to-[#070b14]">
        
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

                {/* Filtro Matriz de Prioridade da Cotação (P1, P2, P3, P4) */}
                <div className="flex flex-wrap items-center rounded-xl border border-slate-700 p-0.5 bg-[#080d18] text-xs font-bold">
                  <button
                    onClick={() => setFiltroPrioridade('TODAS')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${filtroPrioridade === 'TODAS' ? 'bg-cyan-600 text-white font-black' : 'text-slate-400 hover:text-white'}`}
                  >
                    Todas Prio
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
                    title="⚠️ P2: Risco Iminente (&lt; 3 dias de giro + Curva A/B)"
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

                {/* Robô Montador de Carrinho na Divimed (Item por Item pelo Nome) */}
                <button
                  onClick={handleMontarCarrinhoDivimed}
                  disabled={montandoCarrinhoDivimed}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 hover:text-rose-100 border border-rose-500/40 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                  title="O robô fará login na Divimed e adicionará produto a produto no carrinho buscando pelo nome (Mínimo R$ 400)"
                >
                  {montandoCarrinhoDivimed ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                      <span>Montando Divimed ({statusCarrinhoDivimed?.atual || 0}/{statusCarrinhoDivimed?.total || 0})...</span>
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-3.5 h-3.5 text-rose-400" />
                      <span>Montar Divimed (Robô)</span>
                    </>
                  )}
                </button>

                {/* BOTÃO: ABRIR RELATÓRIO DO ROBÔ & AUDITORIA DE REPASSE */}
                {ultimoRelatorioAuditoria && (
                  <button
                    onClick={() => setModalRelatorioAberto(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-100 border border-emerald-500/40 text-xs font-bold transition-all cursor-pointer shadow-sm animate-in fade-in"
                    title={`Ver o relatório completo do robô com repasse do 2º colocado (${ultimoRelatorioAuditoria.distribuidora})`}
                  >
                    <ClipboardList className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Relatório Robô ({ultimoRelatorioAuditoria.distribuidora})</span>
                  </button>
                )}

                {/* BOTÃO: RE-COTAR DIVERGENTES (>40% OU >60% VS ÚLTIMA COMPRA) */}
                {itensDivergentes.length > 0 && (
                  <button
                    onClick={() => {
                      const eansDivergentes = Array.from(new Set(itensDivergentes.map(i => i.ean).filter(Boolean)));
                      handleIniciarCotacaoAoVivo('TODOS', eansDivergentes.length, undefined, eansDivergentes);
                    }}
                    disabled={cotandoAoVivo}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/90 hover:bg-rose-900 text-rose-200 border border-rose-600 text-xs font-black shadow-lg shadow-rose-950/50 transition-all cursor-pointer animate-pulse active:scale-95"
                    title={`${itensDivergentes.length} itens têm cotação do 1º colocado muito distante da última compra (>= 40% mais barato ou >= 60% mais caro). Clique para rodar o robô novamente em todos eles.`}
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                    <span>Re-cotar Divergentes ({itensDivergentes.length})</span>
                  </button>
                )}

                {/* BOTÃO PRINCIPAL: RECARREGAR COTAÇÃO (ROBÔS AO VIVO EM 6 PORTAIS) */}
                <button
                  onClick={() => handleIniciarCotacaoAoVivo('TODOS')}
                  disabled={cotandoAoVivo}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-black shadow-lg shadow-emerald-950/50 hover:shadow-cyan-900/40 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                  title="Disparar os robôs agora para consultar preços ao vivo na Profarma, DPC, Soton Farma, Distrimed, Divimed e Martins Atacado"
                >
                  {cotandoAoVivo ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Cotando nos 6 Portais ({statusCotacao?.atual || 0}/{statusCotacao?.total || 0})...</span>
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

                {/* BOTÃO ULTRA PROEMINENTE: EXIBIR APENAS A TABELA */}
                <button
                  onClick={alternarModoApenasTabela}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border shadow-md active:scale-95 ${
                    modoApenasTabela
                      ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400 shadow-amber-950/50'
                      : 'bg-gradient-to-r from-cyan-600 via-teal-600 to-blue-600 hover:brightness-110 text-white border-cyan-300 shadow-cyan-950/50 ring-2 ring-cyan-400/40'
                  }`}
                  title={modoApenasTabela ? 'Exibir o menu lateral e painéis completos do topo' : 'Exibir apenas a tabela (oculta menus e painéis para 100% de visão)'}
                >
                  <Table className="w-3.5 h-3.5" />
                  <span>{modoApenasTabela ? '← Exibir Painel Completo' : '📊 Exibir Apenas a Tabela'}</span>
                </button>

                {/* BOTÃO DE EXPORTAÇÃO TXT POR FORNECEDOR */}
                <button
                  onClick={handleGerarRelatorioTxt}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-black transition-all cursor-pointer shadow-md active:scale-95"
                  title="Gerar e baixar arquivo TXT organizado com produtos separados por fornecedor"
                >
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  <span>📄 Baixar TXT Fornecedores</span>
                </button>

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
                          checked={(agruparPorDistribuidora ? faltasFiltradas : itensPaginados).length > 0 && (agruparPorDistribuidora ? faltasFiltradas : itensPaginados).every(f => itensSelecionados[f.produto_id])}
                          onChange={() => {
                            const listaAlvo = agruparPorDistribuidora ? faltasFiltradas : itensPaginados;
                            const todosMarcados = listaAlvo.length > 0 && listaAlvo.every(f => itensSelecionados[f.produto_id]);
                            const novoMap = { ...itensSelecionados };
                            listaAlvo.forEach(f => {
                              if (!todosMarcados && f.nao_carrinho) {
                                novoMap[f.produto_id] = false;
                              } else {
                                novoMap[f.produto_id] = !todosMarcados;
                              }
                            });
                            setItensSelecionados(novoMap);
                          }}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                        />
                        <span>Selecionar Todos ({agruparPorDistribuidora ? faltasFiltradas.length : itensPaginados.length})</span>
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
                  ) : itensPaginados.length === 0 ? (
                    <div className="p-12 text-center bg-[#091120] rounded-2xl border border-slate-800">
                      <p className="text-sm font-bold text-slate-400">Nenhum produto encontrado com os filtros selecionados.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {itensPaginados.map(item => renderProdutoCard(item))}
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
                                          onClick={() => setModalHistoricoPreco({ isOpen: true, produto: item })}
                                          className="p-1 rounded bg-[#071324] hover:bg-cyan-900/60 text-cyan-400 border border-cyan-800/80 transition-colors cursor-pointer ml-1"
                                          title="Ver série temporal de preços, melhor dia da semana e compras reais"
                                        >
                                          <LineChart className="w-3.5 h-3.5" />
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
            onDispararRobo={(fornecedor = 'TODOS', lote = 40, prio = 'TODAS_PRIORITARIAS') => handleIniciarCotacaoAoVivo(fornecedor, lote, prio)}
            onDadosAtualizados={() => carregarDados()}
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

    </div>
  );
};
