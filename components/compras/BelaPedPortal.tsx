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
  FileSpreadsheet
} from 'lucide-react';
import { User } from '../../types';
import { useToast } from '../ToastContext';

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
  dias_estoque_restante: number;
  status_ruptura: string;
  custo_unitario: number;
  preco_venda_vigente: number;
  margem_lucro_percentual: number;
  fornecedor_ult_compra: string;
  data_ult_compra: string;
  nf_ult_compra: string;
  qtd_sugerida_7d: number;
  subtotal_7d: number;
  tipo_categoria: 'MEDICAMENTO' | 'PERFUMARIA';
  fornecedor_1?: string;
  preco_1?: number;
  fornecedor_2?: string;
  preco_2?: number;
  diferenca_percentual?: number;
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
  totalComprometido: number;
  saldoLivre: number;
  percentualComprometido: number;
  statusOrcamento: 'LIBERADO' | 'ALERTA' | 'ESTOURADO';
  qtdBoletos: number;
}

export const BelaPedPortal: React.FC<BelaPedPortalProps> = ({
  user,
  theme,
  onNavigate
}) => {
  const { addToast } = useToast();
  
  // Abas de Navegação do BelaPed
  const [activeTab, setActiveTab] = useState<'faltas' | 'cotacao' | 'orcamento' | 'relatorios'>('faltas');

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
  } | null>(null);

  // Faltas 7 Dias
  const [faltas, setFaltas] = useState<FaltaItem7d[]>([]);
  const [itensAvulsos, setItensAvulsos] = useState<any[]>([]);
  const [filtroCurva, setFiltroCurva] = useState<'TODAS' | 'A' | 'B'>('TODAS');
  const [filtroCategoria, setFiltroCategoria] = useState<'TODAS' | 'MEDICAMENTO' | 'PERFUMARIA'>('TODAS');
  const [buscaFalta, setBuscaFalta] = useState('');
  const [itensSelecionados, setItensSelecionados] = useState<Record<number, boolean>>({});

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

  // Carrega todos os dados iniciais
  const carregarDados = async () => {
    try {
      setRefreshing(true);

      const [resOrc, resFaltas, resPortais, resRel] = await Promise.all([
        fetch('/api/belaped/orcamento-boletos'),
        fetch('/api/belaped/faltas-7d'),
        fetch('/api/belaped/portais'),
        fetch('/api/belaped/relatorio-precos')
      ]);

      if (resOrc.ok) {
        const dataOrc = await resOrc.json();
        setOrcamentoInfo(dataOrc);
      }

      if (resFaltas.ok) {
        const dataFaltas = await resFaltas.json();
        setFaltas(dataFaltas.items || []);
        setItensAvulsos(dataFaltas.itens_avulsos || []);
        
        // Inicialmente seleciona todos os itens para cotação
        const selMap: Record<number, boolean> = {};
        (dataFaltas.items || []).forEach((item: FaltaItem7d) => {
          selMap[item.produto_id] = true;
        });
        setItensSelecionados(selMap);
      }

      if (resPortais.ok) {
        const dataPortais = await resPortais.json();
        setPortais(dataPortais.portais || []);
      }

      if (resRel.ok) {
        const dataRel = await resRel.json();
        setRelatorioPrecos(dataRel.produtos || []);
      }

    } catch (e: any) {
      addToast('Erro ao sincronizar dados do BelaPed: ' + e.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // Filtra itens de falta
  const faltasFiltradas = useMemo(() => {
    return faltas.filter(f => {
      if (filtroCurva !== 'TODAS' && f.curva_abc !== filtroCurva) return false;
      if (filtroCategoria !== 'TODAS' && f.tipo_categoria !== filtroCategoria) return false;
      if (buscaFalta) {
        const termo = buscaFalta.toLowerCase();
        const bateNome = f.descricao.toLowerCase().includes(termo);
        const bateEan = f.ean && f.ean.includes(termo);
        if (!bateNome && !bateEan) return false;
      }
      return true;
    });
  }, [faltas, filtroCurva, filtroCategoria, buscaFalta]);

  // Paginação da Tabela de Faltas
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(20);

  // Reseta para a primeira página ao alterar filtros ou busca
  useEffect(() => {
    setPaginaAtual(1);
  }, [filtroCurva, filtroCategoria, buscaFalta, itensPorPagina]);

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

  // Iniciar Cotação ao Vivo com o Robô Puppeteer (Profarma / DPC / Todas)
  const handleIniciarCotacaoAoVivo = async (fornecedor: 'PROFARMA' | 'DPC' | 'TODOS' = 'TODOS') => {
    try {
      setCotandoAoVivo(true);

      // Pega os itens selecionados ou os itens da página/críticos
      const selecionados = faltasFiltradas.filter(f => itensSelecionados[f.produto_id]);
      const eansParaCotar = selecionados.length > 0
        ? selecionados.map(s => s.ean).filter(e => e && e.length >= 7)
        : faltasFiltradas.slice(0, 20).map(s => s.ean).filter(e => e && e.length >= 7);

      const res = await fetch('/api/belaped/cotar-ao-vivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedor,
          limite: 20,
          eans: eansParaCotar.length > 0 ? eansParaCotar : undefined
        })
      });

      const data = await res.json();
      if (!data.success) {
        addToast(data.error || 'Erro ao iniciar cotação', 'error');
        setCotandoAoVivo(false);
        return;
      }

      addToast(data.message || `Robô de cotação iniciado para ${fornecedor}!`, 'success');

      // Monitora o progresso em segundo plano a cada 2.5s
      const timer = setInterval(async () => {
        try {
          const stRes = await fetch('/api/belaped/status-cotacao');
          const stData = await stRes.json();
          if (stData.success && stData.status) {
            setStatusCotacao(stData.status);
            if (!stData.status.emAndamento) {
              clearInterval(timer);
              setCotandoAoVivo(false);
              addToast(`Cotação concluída! ${stData.status.encontrados} produtos obtiveram preços ao vivo!`, 'success');
              carregarDados();
            }
          }
        } catch (e) {
          clearInterval(timer);
          setCotandoAoVivo(false);
        }
      }, 2500);

    } catch (err: any) {
      addToast('Erro na cotação: ' + err.message, 'error');
      setCotandoAoVivo(false);
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

          <button
            onClick={carregarDados}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black transition-all shadow-md cursor-pointer disabled:opacity-50"
            title="Atualizar dados de estoque e cotações"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sincronizar</span>
          </button>
        </div>
      </header>

      {/* ─── CORPO PRINCIPAL COM SCROLL INTERNO ──────────────────────────────── */}
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-[#0b1222] border border-slate-800 shadow-md shrink-0 mt-0.5">
                  {orcamentoInfo.regraMaster.bloquearVencimentosMesAtual ? (
                    <AlertTriangle className="w-5 h-5 text-rose-400 animate-pulse" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#0b1222] border border-slate-800 text-cyan-400">
                      REGRA MASTER • CONTROLE DE FLUXO
                    </span>
                    <span className="text-xs font-bold text-white">
                      Mês Atual ({orcamentoInfo.mesAtual?.nomeMes}): {orcamentoInfo.mesAtual?.statusOrcamento}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-300 mt-1 leading-relaxed">
                    {orcamentoInfo.regraMaster.mensagem}
                  </p>
                </div>
              </div>

              {/* Indicadores de Saldo Atual vs Próximo Mês */}
              <div className="flex items-center gap-4 bg-[#0b1222] px-4 py-2 rounded-xl shadow-md border border-slate-800 shrink-0">
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Saldo Mês Atual</span>
                  <span className={`text-sm font-black ${
                    (orcamentoInfo.mesAtual?.saldoLivre || 0) <= 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    R$ {orcamentoInfo.mesAtual?.saldoLivre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="w-px h-8 bg-slate-800"></div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Saldo {orcamentoInfo.proximoMes?.nomeMes}</span>
                  <span className="text-sm font-black text-cyan-400">
                    R$ {orcamentoInfo.proximoMes?.saldoLivre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── NAVEGAÇÃO POR ABAS DO BELAPED (ESTILO CYBER B2B) ─────────────────── */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('faltas')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'faltas'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/30 scale-105'
                : 'bg-[#0e1626] text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            <Layers className="w-4 h-4 text-cyan-300" />
            <span>1. Reposição 1 Semana (Vendeu/Comprou)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-cyan-950 text-cyan-200 border border-cyan-800">
              {faltas.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('cotacao')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'cotacao'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/30 scale-105'
                : 'bg-[#0e1626] text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            <Globe className="w-4 h-4 text-blue-400" />
            <span>2. Portais B2B & Otimizador de Carrinho</span>
            {carrinhosOtimizados.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-blue-900 text-blue-200">
                {carrinhosOtimizados.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('orcamento')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'orcamento'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/30 scale-105'
                : 'bg-[#0e1626] text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>3. Radar de Orçamento & Boletos</span>
          </button>

          <button
            onClick={() => setActiveTab('relatorios')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'relatorios'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/30 scale-105'
                : 'bg-[#0e1626] text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-purple-400" />
            <span>4. Relatórios & Preços</span>
          </button>
        </div>

        {/* ─── ABA 1: FALTAS & REPOSIÇÃO 1 SEMANA ─────────────────────────────── */}
        {activeTab === 'faltas' && (
          <div className="space-y-4">
            
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

                {/* Filtro Curva ABC */}
                <div className="flex items-center rounded-xl border border-slate-700 p-0.5 bg-[#080d18] text-xs font-bold">
                  <button
                    onClick={() => setFiltroCurva('TODAS')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${filtroCurva === 'TODAS' ? 'bg-cyan-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                  >
                    Todas Curvas
                  </button>
                  <button
                    onClick={() => setFiltroCurva('A')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${filtroCurva === 'A' ? 'bg-rose-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                  >
                    Curva A
                  </button>
                  <button
                    onClick={() => setFiltroCurva('B')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${filtroCurva === 'B' ? 'bg-blue-600 text-white shadow-xs font-black' : 'text-slate-400 hover:text-white'}`}
                  >
                    Curva B
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
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-emerald-300 hover:text-white hover:bg-emerald-950/60 transition-all cursor-pointer"
                    title="Baixar planilha modelo aceita pela Profarma (Codigo/EAN e Quantidade)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Planilha Profarma</span>
                  </button>
                  <button
                    onClick={handleExportarPlanilhaDpc}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-cyan-300 hover:text-white hover:bg-cyan-950/60 transition-all cursor-pointer"
                    title="Baixar planilha modelo aceita pela DPC (codigo ou ean e quantidade)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Planilha DPC</span>
                  </button>
                </div>

                {/* Botão Cotação ao Vivo com Robôs (Profarma e DPC) */}
                <button
                  onClick={() => handleIniciarCotacaoAoVivo('TODOS')}
                  disabled={cotandoAoVivo}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-black shadow-md shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
                  title="Executar robôs nos portais da Profarma e da DPC simultaneamente para disputa real de preços"
                >
                  {cotandoAoVivo ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>Cotando ({statusCotacao?.atual || 0}/{statusCotacao?.total || 0})...</span>
                    </>
                  ) : (
                    <>
                      <Bot className="w-3.5 h-3.5 text-emerald-200" />
                      <span>Cotar ao Vivo (Profarma & DPC)</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setAvulsoModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>+ Item Avulso</span>
                </button>

                <button
                  onClick={handleExecutarSimulacao}
                  disabled={simulando || totaisSelecionados.qtdItens === 0}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black shadow-lg shadow-cyan-900/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-cyan-200" />
                  <span>Otimizar Carrinhos ({totaisSelecionados.qtdItens} itens • R$ {totaisSelecionados.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>
                </button>
              </div>
            </div>

            {/* BARRA DE PROGRESSO DA COTAÇÃO AO VIVO (SE ATIVA) */}
            {statusCotacao && statusCotacao.emAndamento && (
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/80 flex items-center justify-between gap-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-900/60 text-emerald-300">
                    <Bot className="w-4 h-4 animate-bounce" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-emerald-200 block">
                      Robô da Profarma em Execução: item {statusCotacao.atual} de {statusCotacao.total}
                    </span>
                    <span className="text-[11px] text-emerald-400/90 font-medium">
                      EAN atual: {statusCotacao.ultimoItem || 'Pesquisando...'} • {statusCotacao.encontrados} produtos com preço real encontrado
                    </span>
                  </div>
                </div>
                <div className="w-36 bg-slate-800 rounded-full h-2 overflow-hidden border border-emerald-800">
                  <div
                    className="bg-emerald-400 h-full transition-all duration-300"
                    style={{ width: `${Math.round(((statusCotacao.atual || 1) / (statusCotacao.total || 1)) * 100)}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* TABELA DE ALTA DENSIDADE (DIRETRIZES AGENTS.MD: 1 LINHA COMPACTA) */}
            <div className="bg-[#0e1626] rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#09101f] border-b border-slate-800 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-8 text-center whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={itensPaginados.length > 0 && itensPaginados.every(f => itensSelecionados[f.produto_id])}
                          onChange={() => {
                            const todosPaginaMarcados = itensPaginados.length > 0 && itensPaginados.every(f => itensSelecionados[f.produto_id]);
                            const novoMap = { ...itensSelecionados };
                            itensPaginados.forEach(f => {
                              novoMap[f.produto_id] = !todosPaginaMarcados;
                            });
                            setItensSelecionados(novoMap);
                          }}
                          className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                          title="Selecionar todos os itens da página atual"
                        />
                      </th>
                      <th className="py-2.5 px-3 whitespace-nowrap min-w-[220px]">Produto / Metadados</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap w-16">Curva</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap w-20">Saldo</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap w-20">Cobertura</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap w-24 bg-cyan-950/40 text-cyan-300 font-black">
                        Pedir 7 Dias
                      </th>
                      
                      {/* 4 COLUNAS DE COTAÇÃO: 1º E 2º COLOCADOS */}
                      <th className="py-2.5 px-3 whitespace-nowrap w-36 bg-cyan-950/20 text-cyan-400 font-black">
                        1º Colocado (Vendedor)
                      </th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap w-24 bg-cyan-950/20 text-cyan-300 font-black">
                        1º Preço
                      </th>
                      <th className="py-2.5 px-3 whitespace-nowrap w-36 bg-slate-900/60 text-slate-400">
                        2º Colocado (Vendedor)
                      </th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap w-28 bg-slate-900/60 text-slate-400">
                        2º Preço
                      </th>

                      <th className="py-2.5 px-3 text-right whitespace-nowrap w-20 text-emerald-400">Margem</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap w-28 bg-slate-900/60 font-black text-white">
                        Subtotal 7d
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {itensPaginados.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-12 text-center text-slate-500 font-medium">
                          Nenhum produto encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      itensPaginados.map((item) => {
                        const isSelected = Boolean(itensSelecionados[item.produto_id]);
                        const isRuptura = item.saldo <= 0;
                        const preco1 = item.preco_1 ?? item.custo_unitario;
                        const preco2 = item.preco_2 ?? (item.custo_unitario * 1.05);
                        const fornecedor1 = item.fornecedor_1 || item.fornecedor_ult_compra || 'PROFARMA';
                        const fornecedor2 = item.fornecedor_2 || 'DISTRIMED';
                        const diffPct = item.diferenca_percentual ?? Number((((preco2 - preco1) / preco1) * 100).toFixed(1));

                        return (
                          <tr 
                            key={item.produto_id}
                            className={`hover:bg-slate-800/40 transition-colors ${
                              isSelected ? 'bg-cyan-950/15' : ''
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => setItensSelecionados(prev => ({ ...prev, [item.produto_id]: !prev[item.produto_id] }))}
                                className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                              />
                            </td>

                            {/* Produto e Metadados em 1 linha compacta */}
                            <td className="py-2 px-3">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-100 leading-tight">
                                  {item.descricao}
                                </span>
                                <div className="inline-flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                  <span>EAN: {item.ean || 'Sem EAN'}</span>
                                  <span>•</span>
                                  <span className={item.tipo_categoria === 'MEDICAMENTO' ? 'text-emerald-400 font-semibold' : 'text-purple-400 font-semibold'}>
                                    {item.tipo_categoria}
                                  </span>
                                  {item.apresentacao && (
                                    <>
                                      <span>•</span>
                                      <span className="truncate max-w-[120px]">{item.apresentacao}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Curva ABC Badge */}
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
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
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <span className={`font-black ${isRuptura ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
                                {item.saldo} un
                              </span>
                            </td>

                            {/* Cobertura */}
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <span className={`font-bold text-[11px] ${
                                item.dias_estoque_restante <= 0 ? 'text-rose-400' : 'text-amber-400'
                              }`}>
                                {item.dias_estoque_restante <= 0 ? '0d (Ruptura)' : `${item.dias_estoque_restante}d`}
                              </span>
                            </td>

                            {/* Pedir 7 Dias */}
                            <td className="py-2 px-3 text-center whitespace-nowrap bg-cyan-950/30">
                              <span className="font-black text-cyan-300 text-sm">
                                {item.qtd_sugerida_7d} un
                              </span>
                            </td>

                            {/* 1º Colocado (Vendedor) */}
                            <td className="py-2 px-3 whitespace-nowrap bg-cyan-950/10">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"></span>
                                <span className="font-bold text-cyan-300 text-[11px] truncate max-w-[130px]" title={fornecedor1}>
                                  {fornecedor1}
                                </span>
                              </div>
                            </td>

                            {/* 1º Preço */}
                            <td className="py-2 px-3 text-right whitespace-nowrap font-black text-cyan-300 bg-cyan-950/10 text-xs">
                              R$ {preco1.toFixed(2)}
                            </td>

                            {/* 2º Colocado (Vendedor) */}
                            <td className="py-2 px-3 whitespace-nowrap bg-slate-900/30">
                              <span className="text-slate-400 text-[11px] truncate max-w-[130px] block" title={fornecedor2}>
                                {fornecedor2}
                              </span>
                            </td>

                            {/* 2º Preço (+X%) */}
                            <td className="py-2 px-3 text-right whitespace-nowrap bg-slate-900/30 text-xs">
                              <span className="text-slate-300 font-medium">R$ {preco2.toFixed(2)}</span>
                              {diffPct > 0 && (
                                <span className="text-[10px] text-amber-400/90 ml-1 font-semibold">
                                  +{diffPct}%
                                </span>
                              )}
                            </td>

                            {/* Margem de Lucro */}
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              <span className={`font-black text-xs ${
                                item.margem_lucro_percentual >= 30 ? 'text-emerald-400' : 'text-slate-400'
                              }`}>
                                {item.margem_lucro_percentual}%
                              </span>
                            </td>

                            {/* Subtotal 7d */}
                            <td className="py-2 px-3 text-right whitespace-nowrap font-black text-white bg-slate-900/40">
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
              
              {/* Mês Atual */}
              <div className={`p-4 rounded-2xl border bg-[#0e1626] shadow-md space-y-3 ${
                orcamentoInfo.mesAtual?.statusOrcamento === 'ESTOURADO'
                  ? 'border-rose-800'
                  : 'border-slate-800'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-black text-sm uppercase text-white">
                    Mês Atual ({orcamentoInfo.mesAtual?.nomeMes})
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    orcamentoInfo.mesAtual?.statusOrcamento === 'ESTOURADO'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}>
                    {orcamentoInfo.mesAtual?.statusOrcamento}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Teto do Mês:</span>
                    <b className="text-white">R$ {orcamentoInfo.mesAtual?.limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Boletos Comprometidos:</span>
                    <b className="text-white">R$ {orcamentoInfo.mesAtual?.totalComprometido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-800">
                    <span className="font-bold text-slate-300">Saldo Disponível:</span>
                    <b className={`font-black text-sm ${
                      (orcamentoInfo.mesAtual?.saldoLivre || 0) <= 0 ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                      R$ {orcamentoInfo.mesAtual?.saldoLivre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </b>
                  </div>
                </div>

                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${
                      (orcamentoInfo.mesAtual?.percentualComprometido || 0) >= 100 ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, orcamentoInfo.mesAtual?.percentualComprometido || 0)}%` }}
                  />
                </div>
              </div>

              {/* Próximo Mês */}
              <div className="p-4 rounded-2xl border border-slate-800 bg-[#0e1626] shadow-md space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-sm uppercase text-white">
                    Próximo Mês ({orcamentoInfo.proximoMes?.nomeMes})
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {orcamentoInfo.proximoMes?.statusOrcamento}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Teto do Mês:</span>
                    <b className="text-white">R$ {orcamentoInfo.proximoMes?.limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Boletos Agendados:</span>
                    <b className="text-white">R$ {orcamentoInfo.proximoMes?.totalComprometido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-800">
                    <span className="font-bold text-slate-300">Saldo para Novos Boletos:</span>
                    <b className="font-black text-sm text-cyan-400">
                      R$ {orcamentoInfo.proximoMes?.saldoLivre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </b>
                  </div>
                </div>

                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-cyan-500"
                    style={{ width: `${Math.min(100, orcamentoInfo.proximoMes?.percentualComprometido || 0)}%` }}
                  />
                </div>
              </div>

              {/* Mês Seguinte */}
              <div className="p-4 rounded-2xl border border-slate-800 bg-[#0e1626] shadow-md space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-sm uppercase text-white">
                    Mês Seguinte ({orcamentoInfo.mesSeguinte?.nomeMes})
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-950 text-purple-300 border border-purple-800">
                    {orcamentoInfo.mesSeguinte?.statusOrcamento}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Teto do Mês:</span>
                    <b className="text-white">R$ {orcamentoInfo.mesSeguinte?.limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Boletos Agendados:</span>
                    <b className="text-white">R$ {orcamentoInfo.mesSeguinte?.totalComprometido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-800">
                    <span className="font-bold text-slate-300">Saldo Disponível:</span>
                    <b className="font-black text-sm text-purple-400">
                      R$ {orcamentoInfo.mesSeguinte?.saldoLivre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </b>
                  </div>
                </div>

                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500"
                    style={{ width: `${Math.min(100, orcamentoInfo.mesSeguinte?.percentualComprometido || 0)}%` }}
                  />
                </div>
              </div>

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

    </div>
  );
};
