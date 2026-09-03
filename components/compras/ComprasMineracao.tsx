import React, { useState, useEffect, useMemo } from 'react';
import { 
  Scan, 
  Sparkles, 
  TrendingDown, 
  TrendingUp, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  Filter, 
  ArrowRight, 
  MessageSquare, 
  RefreshCw, 
  Layers,
  FileText,
  BadgePercent,
  Check,
  Zap,
  ShoppingBag,
  Trash2,
  X,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Send,
  LineChart as LineChartIcon,
  BarChart3,
  Calendar
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { OportunidadeMinerada, User } from '../../types';
import { useToast } from '../ToastContext';
import { ComprasChatViewer } from './ComprasChatViewer';

interface ComprasMineracaoProps {
  user: User;
  theme: 'light' | 'dark';
  onNavigateToTab?: (tab: string, preselectedItems?: any[]) => void;
}

const formatarData = (val?: string | null): string => {
  if (!val) return '';
  try {
    const s = String(val).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    const brMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brMatch) return `${brMatch[1]}/${brMatch[2]}/${brMatch[3]}`;
    const isoDateMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDateMatch) return `${isoDateMatch[3]}/${isoDateMatch[2]}/${isoDateMatch[1]}`;
    const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
    return isNaN(d.getTime()) ? s.split(' ')[0] : d.toLocaleDateString('pt-BR');
  } catch {
    return String(val);
  }
};

export const ComprasMineracao: React.FC<ComprasMineracaoProps> = ({
  user,
  theme,
  onNavigateToTab
}) => {
  const { addToast } = useToast();
  const [oportunidades, setOportunidades] = useState<OportunidadeMinerada[]>([]);
  const [chatOportunidadeSelecionada, setChatOportunidadeSelecionada] = useState<OportunidadeMinerada | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [diasVarredura, setDiasVarredura] = useState<number>(14);
  const [busca, setBusca] = useState('');
  const [abaAtiva, setAbaAtiva] = useState<'RELEVANTES' | 'DESCONTO' | 'RUPTURA' | 'TODOS'>('RELEVANTES');
  const [sincronizandoCompras, setSincronizandoCompras] = useState(false);
  const [auditoriaAbertaId, setAuditoriaAbertaId] = useState<string | null>(null);

  // Fecha o card de auditoria ao tocar/clicar fora (UX refinada mobile/desktop)
  useEffect(() => {
    if (!auditoriaAbertaId) return;
    const fecharAoClicarFora = () => setAuditoriaAbertaId(null);
    window.addEventListener('click', fecharAoClicarFora);
    return () => window.removeEventListener('click', fecharAoClicarFora);
  }, [auditoriaAbertaId]);

  // Modal de Detalhes da Oferta
  const [selectedOferta, setSelectedOferta] = useState<OportunidadeMinerada | null>(null);
  
  // Modal de Produtos Equivalentes da Oferta
  const [modalEquivOferta, setModalEquivOferta] = useState<any | null>(null);

  // Modal de Mineração Manual / Colar Texto
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualTexto, setManualTexto] = useState('');
  const [manualTelefone, setManualTelefone] = useState('');
  const [manualRepresentante, setManualRepresentante] = useState('');
  const [processandoManual, setProcessandoManual] = useState(false);

  // Estados do Agente Horácio — Especialista em Compras
  const [relatoriosHoracio, setRelatoriosHoracio] = useState<any[]>([]);
  const [loadingHoracio, setLoadingHoracio] = useState(false);
  const [executandoHoracio, setExecutandoHoracio] = useState(false);
  const [relatorioSelecionado, setRelatorioSelecionado] = useState<any | null>(null);
  const [horacioExpandido, setHoracioExpandido] = useState(true);

  const carregarRelatoriosHoracio = async (isSilent = false) => {
    try {
      if (!isSilent && relatoriosHoracio.length === 0) {
        setLoadingHoracio(true);
      }
      const res = await fetch('/api/central-compras/horacio/relatorios?limite=10');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setRelatoriosHoracio(data.data);
          if (data.data.length > 0) {
            setRelatorioSelecionado((prev: any) => {
              // Mantém o fornecedor que o usuário já escolheu clicar
              if (prev && prev.id) {
                const aindaExiste = data.data.find((r: any) => r.id === prev.id);
                if (aindaExiste) return aindaExiste;
              }
              return data.data[0];
            });
          } else {
            setRelatorioSelecionado(null);
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar relatórios do Horácio:', e);
    } finally {
      setLoadingHoracio(false);
    }
  };

  const handlePedirAnaliseHoracio = async () => {
    try {
      setExecutandoHoracio(true);
      addToast('Horácio iniciando análise executiva e consolidação de cortes...', 'info');
      const res = await fetch('/api/central-compras/horacio/executar-analise', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addToast(`Horácio concluiu a análise! ${data.totalRelatorios || 0} consolidações geradas.`, 'success');
        await carregarRelatoriosHoracio();
      } else {
        addToast(data.error || 'Erro ao executar análise do Horácio', 'error');
      }
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setExecutandoHoracio(false);
    }
  };

  const handleCriarCotacaoHoracio = async (relId: string) => {
    try {
      const res = await fetch(`/api/central-compras/horacio/criar-cotacao/${relId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addToast(`Cotação ${data.numeroCotacao} criada com ${data.totalItens} itens recomendados!`, 'success');
        if (onNavigateToTab) {
          onNavigateToTab('cotacoes');
        }
      } else {
        addToast(data.error || 'Erro ao criar cotação', 'error');
      }
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleReenviarWhatsappHoracio = async (relId: string) => {
    try {
      const res = await fetch(`/api/central-compras/horacio/disparar-whatsapp/${relId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addToast('Alerta reenviado para o WhatsApp do Administrador!', 'success');
      } else {
        addToast(data.error || 'Falha ao reenviar WhatsApp', 'error');
      }
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  // Filtro de Exibição do Dia vs Histórico
  const [apenasHoje, setApenasHoje] = useState(true);

  // Modal de Gráfico de Variação de Preço
  const [modalGraficoProduto, setModalGraficoProduto] = useState<string | null>(null);
  const [dadosGrafico, setDadosGrafico] = useState<any | null>(null);
  const [loadingGrafico, setLoadingGrafico] = useState(false);

  const handleAbrirGraficoVariacao = async (produtoNome: string, ean?: string) => {
    setModalGraficoProduto(produtoNome);
    setDadosGrafico(null);
    setLoadingGrafico(true);
    try {
      const q = new URLSearchParams({ produto: produtoNome });
      if (ean) q.append('ean', ean);
      const res = await fetch(`/api/central-compras/mineracao/variacao-precos?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDadosGrafico(data.data);
        }
      }
    } catch(err: any) {
      addToast('Erro ao carregar gráfico de variação: ' + err.message, 'error');
    } finally {
      setLoadingGrafico(false);
    }
  };

  const carregarOportunidades = async () => {
    try {
      const res = await fetch(`/api/central-compras/oportunidades?limite=100&apenas_hoje=${apenasHoje}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setOportunidades(data.data);
        }
      }
    } catch (err: any) {
      console.warn('Erro ao carregar oportunidades:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarOportunidades();
    carregarRelatoriosHoracio();
    // Atualiza automaticamente a cada 15 segundos para exibir novas ofertas mineradas
    const interval = setInterval(() => {
      carregarOportunidades();
      carregarRelatoriosHoracio(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [apenasHoje]);

  const dispararVarredura = async (diasParam?: number) => {
    const dias = diasParam !== undefined ? diasParam : diasVarredura;
    try {
      setScanning(true);
      const url = dias >= 90 ? '/api/central-compras/minerar-90-dias' : '/api/central-compras/whatsapp/minerar';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias, forcarReleitura: true })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const ofertasCount = data.data?.ofertasIndexadas || 0;
        const fornecedoresCount = data.data?.fornecedoresCadastrados || data.data?.representantesCadastrados || 0;
        if (ofertasCount > 0) {
          addToast(`✅ Varredura concluída! ${fornecedoresCount} fornecedores e ${ofertasCount} ofertas mapeadas.`, 'success');
        } else {
          addToast(`ℹ️ Varredura concluída! Nenhuma nova tabela de preços identificada no WhatsApp ainda. Você pode colar mensagens de representantes no botão "Colar Oferta".`, 'info');
        }
        carregarOportunidades();
      } else {
        addToast('Erro na mineração: ' + (data.error || 'Falha ao processar conversas'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleSincronizarUltimasCompras = async () => {
    try {
      setSincronizandoCompras(true);
      addToast('Conectando ao Digifarma e sincronizando últimas compras...', 'info');
      const res = await fetch('/api/central-compras/sincronizar-ultimas-compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias: 90 })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`✅ ${data.message || 'Últimas compras sincronizadas com sucesso!'}`, 'success');
        await carregarOportunidades();
      } else {
        addToast(data.error || 'Erro ao sincronizar últimas compras do Digifarma', 'error');
      }
    } catch (err: any) {
      addToast('Erro na conexão: ' + err.message, 'error');
    } finally {
      setSincronizandoCompras(false);
    }
  };

  const handleProcessarTextoManual = async () => {
    if (!manualTexto.trim()) {
      addToast('Cole o texto da oferta antes de processar.', 'warning');
      return;
    }
    try {
      setProcessandoManual(true);
      const res = await fetch('/api/central-compras/mineracao/processar-texto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: manualTexto,
          phone: manualTelefone || '5532999990000',
          pushName: manualRepresentante || 'Representante Comercial'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const qtdOfertas = data.data?.ofertas?.length || 0;
        addToast(`✅ Mineração concluída! ${qtdOfertas} oferta(s) extraída(s) com sucesso.`, 'success');
        setIsManualModalOpen(false);
        setManualTexto('');
        setManualTelefone('');
        setManualRepresentante('');
        carregarOportunidades();
      } else {
        addToast('Erro ao minerar texto: ' + (data.error || 'Falha ao processar'), 'error');
      }
    } catch (err: any) {
      addToast('Erro de comunicação: ' + err.message, 'error');
    } finally {
      setProcessandoManual(false);
    }
  };

  const [limpandoRadar, setLimpandoRadar] = useState(false);

  const handleLimparRadar = async () => {
    if (!confirm('Deseja limpar as ofertas antigas do radar para remover entradas incorretas e começar do zero?')) {
      return;
    }
    try {
      setLimpandoRadar(true);
      const res = await fetch('/api/central-compras/mineracao/limpar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tudo: true })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('🧹 Radar limpo com sucesso! Você pode varrer ou colar novas ofertas.', 'success');
        setOportunidades([]);
      } else {
        addToast(data.error || 'Erro ao limpar radar.', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao limpar: ' + err.message, 'error');
    } finally {
      setLimpandoRadar(false);
    }
  };

  const handleExcluirOportunidade = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/central-compras/oportunidades/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        addToast('Oferta removida do radar.', 'info');
        setOportunidades(prev => prev.filter(o => o.id !== id));
      }
    } catch (err) {}
  };

  const oportunidadesFiltradas = useMemo(() => {
    return oportunidades
      .filter(op => {
        const prodNome = (op as any).produto_nome || op.produtoNome || '';
        const distNome = (op as any).distribuidora || (op as any).fornecedorNome || '';
        const repNome = (op as any).representante || (op as any).representanteNome || '';
        const eanStr = (op as any).ean || '';

        const matchBusca = !busca || 
          prodNome.toLowerCase().includes(busca.toLowerCase()) ||
          distNome.toLowerCase().includes(busca.toLowerCase()) ||
          repNome.toLowerCase().includes(busca.toLowerCase()) ||
          eanStr.includes(busca);

        if (!matchBusca) return false;

        const economizou = (op.economiaPercentual || 0) > 0;
        const temRuptura = Boolean(op.emRuptura || (op.estoqueAtual !== undefined && op.estoqueAtual <= 0));
        const temEstoqueBaixo = Boolean(op.estoqueMinimo && op.estoqueAtual !== undefined && op.estoqueAtual < op.estoqueMinimo);
        const precisaComprar = temRuptura || temEstoqueBaixo;

        if (abaAtiva === 'RELEVANTES') {
          // Exibir somente os relevantes: necessidade de estoque OU maior desconto
          return precisaComprar || economizou;
        }

        if (abaAtiva === 'DESCONTO') {
          return economizou;
        }

        if (abaAtiva === 'RUPTURA') {
          return precisaComprar;
        }

        return true; // 'TODOS'
      })
      .sort((a, b) => {
        if (abaAtiva === 'DESCONTO') {
          return (b.economiaPercentual || 0) - (a.economiaPercentual || 0);
        }
        if (abaAtiva === 'RUPTURA') {
          const scoreA = (a.estoqueAtual !== undefined && a.estoqueAtual <= 0 ? 100 : 50) + (a.economiaPercentual || 0);
          const scoreB = (b.estoqueAtual !== undefined && b.estoqueAtual <= 0 ? 100 : 50) + (b.economiaPercentual || 0);
          return scoreB - scoreA;
        }
        // 'RELEVANTES' ou padrão: pelo scoreRelevancia (Ruptura + Desconto primeiro, depois rupturas, depois super descontos)
        return (b.scoreRelevancia || 0) - (a.scoreRelevancia || 0);
      });
  }, [oportunidades, busca, abaAtiva]);

  const handleCriarCotacaoComOferta = (op: OportunidadeMinerada) => {
    if (onNavigateToTab) {
      onNavigateToTab('cotacoes', [{
        produtoId: 0,
        descricao: (op as any).produto_nome || op.produtoNome,
        ean: op.ean || '',
        quantidade: 10,
        precoUnitarioEstimado: (op as any).preco_ofertado || op.precoLiquidoEfetivo || op.precoOfertado
      }]);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Ações de Varredura */}
      <div className="p-6 rounded-[2rem] bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-xs font-black uppercase tracking-wider border border-red-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Radar de Mineração IA
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              Mineração de Oportunidades & Histórico de Ofertas
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl font-medium">
              Varredura contínua de conversas, encartes e mensagens do WhatsApp Comercial, cruzando os preços ofertados com o histórico de compras do Digifarma.
            </p>
          </div>

          {/* Painel de Disparo de Varredura */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
            <div className="flex items-center gap-2 px-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <select
                value={diasVarredura}
                onChange={(e) => setDiasVarredura(parseInt(e.target.value, 10))}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                <option value={7} className="bg-slate-800 text-white">Últimos 7 dias</option>
                <option value={14} className="bg-slate-800 text-white">Últimas 2 semanas (14 dias)</option>
                <option value={30} className="bg-slate-800 text-white">Últimos 30 dias</option>
                <option value={60} className="bg-slate-800 text-white">Últimos 60 dias</option>
                <option value={90} className="bg-slate-800 text-white">Últimos 90 dias (Retroativo)</option>
              </select>
            </div>

            <button
              onClick={() => dispararVarredura()}
              disabled={scanning}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-black uppercase tracking-wider shadow-lg hover:shadow-red-500/25 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
            >
              <Scan className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Minerando 90 Dias...' : 'Varrer WhatsApp Agora'}
            </button>

            <button
              onClick={() => setIsManualModalOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-black uppercase tracking-wider border border-slate-600 transition-all cursor-pointer active:scale-95"
              title="Colar texto de mensagem ou encarte de representante"
            >
              <FileText className="w-4 h-4 text-orange-400" />
              Colar Oferta
            </button>

            <button
              onClick={handleSincronizarUltimasCompras}
              disabled={sincronizandoCompras}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black uppercase tracking-wider shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-50 cursor-pointer active:scale-95 whitespace-nowrap"
              title="Sincronizar histórico das últimas notas de entrada do Digifarma e recalcular oportunidades"
            >
              <RefreshCw className={`w-4 h-4 ${sincronizandoCompras ? 'animate-spin' : ''}`} />
              {sincronizandoCompras ? 'Sincronizando...' : 'Sincronizar Últimas Compras do Digifarma'}
            </button>

            <button
              onClick={handleLimparRadar}
              disabled={limpandoRadar}
              className="flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:text-slate-400 dark:hover:text-rose-400 text-xs font-black uppercase tracking-wider border border-slate-200 dark:border-slate-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              title="Limpar ofertas antigas do radar"
            >
              <Trash2 className="w-4 h-4" />
              {limpandoRadar ? 'Limpando...' : 'Limpar Radar'}
            </button>
          </div>
        </div>
      </div>

      {/* PAINEL DO AGENTE HORÁCIO — ESPECIALISTA EM COMPRAS */}
      <div className="rounded-[2rem] bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/30 p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-indigo-500/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-2xl shadow-inner">
              👔
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white tracking-tight">
                  Horácio — Especialista em Compras
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-black tracking-wide uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Vigilante em Tempo Real
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Monitorando WhatsApp • Zero Ruptura • Cortes programados às 11:00 e 16:00
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePedirAnaliseHoracio}
              disabled={executandoHoracio}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider shadow-lg hover:shadow-indigo-500/25 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              title="Solicitar ao Horácio uma consolidação de oportunidades agora"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-300 ${executandoHoracio ? 'animate-spin' : ''}`} />
              {executandoHoracio ? 'Horácio Analisando...' : 'Pedir Análise ao Horácio Agora'}
            </button>
            <button
              onClick={() => setHoracioExpandido(!horacioExpandido)}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title={horacioExpandido ? 'Recolher painel' : 'Expandir painel'}
            >
              {horacioExpandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {horacioExpandido && (
          <div className="mt-4 space-y-4">
            {relatoriosHoracio.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 text-center text-xs text-slate-400">
                O Horácio ainda não emitiu relatórios neste ciclo. Clique em <strong>"Pedir Análise ao Horácio Agora"</strong> ou aguarde o próximo corte das 16h00.
              </div>
            ) : (
              <div>
                {/* Seletor de Relatórios do Horácio se houver múltiplos */}
                {relatoriosHoracio.length > 1 && (
                  <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
                    {relatoriosHoracio.map((rel) => (
                      <button
                        key={rel.id}
                        onClick={() => setRelatorioSelecionado(rel)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                          relatorioSelecionado?.id === rel.id
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-slate-800/80 text-slate-400 hover:text-white'
                        }`}
                      >
                        {rel.fornecedor_nome || 'Consolidação'} ({rel.itens?.length || 0} itens)
                      </button>
                    ))}
                  </div>
                )}

                {relatorioSelecionado && (
                  <div className="space-y-3">
                    {/* Cabeçalho Executivo do Fornecedor */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Distribuidor / Representante</span>
                        <span className="text-sm font-black text-white block mt-0.5">{relatorioSelecionado.fornecedor_nome}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Pedido Mínimo vs Sugerido</span>
                        <span className="text-sm font-black text-white block mt-0.5">
                          R$ {relatorioSelecionado.valor_total_sugerido?.toFixed(2)}
                          <span className="text-[11px] font-medium text-slate-400 ml-1">
                            (Mín: R$ {relatorioSelecionado.pedido_minimo?.toFixed(2)})
                          </span>
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Status de Urgência</span>
                        <span className={`text-xs font-black block mt-1 ${
                          relatorioSelecionado.status_urgencia?.includes('CRÍTICO') ? 'text-rose-400' : 'text-amber-400'
                        }`}>
                          {relatorioSelecionado.status_urgencia}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleCriarCotacaoHoracio(relatorioSelecionado.id)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer"
                          title="Abrir cotação aberta com todos os itens recomendados pelo Horácio"
                        >
                          Gerar Cotação
                        </button>
                        <button
                          onClick={() => handleReenviarWhatsappHoracio(relatorioSelecionado.id)}
                          className="p-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          title="Reenviar relatório no WhatsApp do Administrador"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                      {/* Tabela de Produtos Sugeridos pelo Horácio */}
                    {relatorioSelecionado.itens && relatorioSelecionado.itens.length > 0 && (
                      <div className="rounded-xl border border-slate-700/60 overflow-hidden bg-slate-900/80">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-800/80 text-slate-300 font-bold border-b border-slate-700/60">
                            <tr>
                              <th className="py-2.5 px-3">Produto / Apresentação</th>
                              <th className="py-2.5 px-2">Tipo</th>
                              <th className="py-2.5 px-2">Histórico</th>
                              <th className="py-2.5 px-2">Preço Ofertado</th>
                              <th className="py-2.5 px-2 text-center">Qtd Sugerida</th>
                              <th className="py-2.5 px-3">Motivo / Urgência</th>
                              <th className="py-2.5 px-3 text-right">Economia Estimada</th>
                              <th className="py-2.5 px-2 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 text-slate-200">
                            {relatorioSelecionado.itens.map((it: any, idx: number) => {
                              const abrirChatDoItemHoracio = () => {
                                const opMock: any = {
                                  id: it.id || 'horacio_' + idx,
                                  mensagemId: it.mensagemId || '',
                                  produtoNome: it.produtoNome,
                                  precoOfertado: it.precoOfertado,
                                  precoUltCompra: it.precoHistorico,
                                  economiaPercentual: it.economiaEstimadaPct,
                                  fornecedorNome: it.distribuidora || relatorioSelecionado?.fornecedor_nome,
                                  distribuidora: it.distribuidora || relatorioSelecionado?.fornecedor_nome,
                                  representante: it.representante,
                                  telefone: it.telefone,
                                  ean: it.ean,
                                  dataOferta: relatorioSelecionado?.created_at
                                };
                                setChatOportunidadeSelecionada(opMock);
                              };

                              return (
                                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                                  <td className="py-2.5 px-3 max-w-xs">
                                    <button
                                      onClick={abrirChatDoItemHoracio}
                                      className="text-left font-bold text-white hover:text-emerald-400 transition-colors cursor-pointer group flex items-start gap-1.5 truncate w-full"
                                      title="Clique para abrir a conversa do WhatsApp que cita este produto"
                                    >
                                      <span className="group-hover:underline truncate">{it.produtoNome}</span>
                                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                                    </button>
                                  </td>
                                  <td className="py-2.5 px-2">
                                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">
                                      {it.tipo}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2 text-slate-400">
                                    R$ {it.precoHistorico ? it.precoHistorico.toFixed(2) : '-'}
                                  </td>
                                  <td className="py-2.5 px-2 font-black text-emerald-400">
                                    R$ {it.precoOfertado?.toFixed(2)}
                                  </td>
                                  <td className="py-2.5 px-2 text-center font-bold text-amber-300">
                                    {it.qtdSugerida} un
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-300 text-[11px]">
                                    {it.motivo}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-black text-emerald-400">
                                    R$ {it.economiaEstimadaValor ? it.economiaEstimadaValor.toFixed(2) : '0.00'}
                                  </td>
                                  <td className="py-2.5 px-2 text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        onClick={abrirChatDoItemHoracio}
                                        className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 transition-colors cursor-pointer"
                                        title="Abrir conversa no WhatsApp"
                                      >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleAbrirGraficoVariacao(it.produtoNome, it.ean)}
                                        className="p-1.5 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-950/40 transition-colors cursor-pointer"
                                        title="Ver gráfico de variação de preços"
                                      >
                                        <LineChartIcon className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por produto minerado, distribuidora ou representante..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setApenasHoje(!apenasHoje)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              apenasHoje
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-sm'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
            title={apenasHoje ? 'Exibindo apenas ofertas recebidas hoje. Clique para ver histórico.' : 'Exibindo todo o histórico. Clique para filtrar apenas hoje.'}
          >
            <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{apenasHoje ? '📅 Apenas Hoje' : '🌐 Todo o Histórico'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'RELEVANTES', label: '🎯 Mais Relevantes', badge: oportunidades.filter(o => (o.economiaPercentual || 0) > 0 || o.emRuptura).length },
            { id: 'DESCONTO', label: '📉 Maior Desconto', badge: oportunidades.filter(o => (o.economiaPercentual || 0) > 0).length },
            { id: 'RUPTURA', label: '🚨 Reposição / Ruptura', badge: oportunidades.filter(o => o.emRuptura).length },
            { id: 'TODOS', label: '📦 Todas as Ofertas', badge: oportunidades.length }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setAbaAtiva(f.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                abaAtiva === f.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md scale-[1.02]'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>{f.label}</span>
              {f.badge > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  abaAtiva === f.id
                    ? 'bg-red-600 text-white dark:bg-red-500'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}>
                  {f.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela Operacional de Oportunidades Relevantes */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-bold bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-red-600" />
          Carregando oportunidades mineradas do WhatsApp...
        </div>
      ) : oportunidadesFiltradas.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
          <MessageSquare className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="font-bold text-slate-700 dark:text-slate-300">Nenhuma oportunidade relevante encontrada nesta aba</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {abaAtiva === 'RELEVANTES' 
              ? 'Não há ofertas com desconto ou ruptura no momento. Alterne para a aba "Todas as Ofertas" ou clique em "Varrer WhatsApp Agora".'
              : 'Clique em "Varrer WhatsApp Agora" para extrair ofertas das conversas com os representantes.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-4 px-4">Produto & Fornecedor</th>
                  <th className="py-4 px-3">Preço Ofertado</th>
                  <th className="py-4 px-3">Última Compra</th>
                  <th className="py-4 px-3 text-center">Desconto</th>
                  <th className="py-4 px-3 text-center">Estoque</th>
                  <th className="py-4 px-4 min-w-[260px]">Justificativa de Compra</th>
                  <th className="py-4 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {oportunidadesFiltradas.map(op => {
                  const ehVantajosa = op.status === 'Aprovado_Radar' || (op.economiaPercentual || 0) > 0;
                  const economizou = op.economiaPercentual && op.economiaPercentual > 0;
                  const emRup = Boolean(op.emRuptura || (op.estoqueAtual !== undefined && op.estoqueAtual <= 0));
                  const precoOf = op.precoLiquidoEfetivo || op.precoOfertado;
                  const precoUlt = op.precoUltCompraDigifarma;
                  const econValor = (precoUlt && precoUlt > precoOf) ? (precoUlt - precoOf) : (op.economiaValor || 0);

                  // Cores e texto da Justificativa
                  const justBadge = op.justificativa?.badge || (emRup ? '🚨 Reposição Necessária' : (economizou ? '📉 Preço Competitivo' : 'Preço Normal'));
                  const justTexto = op.justificativa?.texto || (emRup 
                    ? `Estoque zerado ou abaixo do mínimo. Reposição necessária.` 
                    : (economizou 
                      ? `${op.economiaPercentual?.toFixed(1)}% mais barato que no Digifarma (Economia de R$ ${econValor.toFixed(2)}/un).`
                      : 'Oferta recebida de representante parceiro.'));
                  
                  const justCor = op.justificativa?.cor || (emRup ? 'red' : (economizou ? 'emerald' : 'slate'));

                  return (
                    <tr 
                      key={op.id}
                      className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        emRup && economizou 
                          ? 'bg-red-50/20 dark:bg-red-950/10' 
                          : (economizou ? 'bg-emerald-50/10 dark:bg-emerald-950/5' : '')
                      }`}
                    >
                      {/* Produto & Fornecedor */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <button
                          onClick={() => setChatOportunidadeSelecionada(op)}
                          className="text-left font-black text-sm text-slate-900 dark:text-white line-clamp-2 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer group flex items-start gap-1.5"
                          title="Clique para abrir a conversa do WhatsApp que cita este produto"
                        >
                          <span className="group-hover:underline">{op.produtoNome}</span>
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                        </button>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {op.fornecedorNome || (op as any).distribuidora || 'Distribuidora'}
                          </span>
                          {op.representanteNome && (
                            <span>• Rep: {op.representanteNome}</span>
                          )}
                          {op.ean && (
                            <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">
                              {op.ean}
                            </span>
                          )}
                          {op.grupoEquivalente && (
                            <button
                              onClick={() => setModalEquivOferta(op.grupoEquivalente)}
                              className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 transition-colors cursor-pointer border border-indigo-200 dark:border-indigo-800"
                              title="Clique para ver o estoque e preços dos produtos equivalentes"
                            >
                              <Layers className="w-3 h-3 text-indigo-500" />
                              <span>Equivalentes: {op.grupoEquivalente.saldoTotal} un ({op.grupoEquivalente.quantidadeProdutos} marcas)</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Preço Ofertado */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100 block">
                          R$ {precoOf?.toFixed(2)}
                        </span>
                        {op.bonificacaoTexto && (
                          <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-black">
                            🎁 {op.bonificacaoTexto}
                          </span>
                        )}
                      </td>

                      {/* Última Compra Digifarma */}
                      <td className="py-3.5 px-3 whitespace-nowrap relative">
                        {precoUlt ? (
                          <div className="relative group inline-block">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAuditoriaAbertaId(auditoriaAbertaId === op.id ? null : op.id);
                              }}
                              className="text-left cursor-pointer focus:outline-none block"
                              title="Clique ou passe o mouse para ver detalhes da auditoria no Digifarma"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-slate-800 dark:text-slate-100 block">
                                  R$ {precoUlt.toFixed(2)}/un
                                </span>
                                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 text-[9px] font-black group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                  ℹ️
                                </span>
                              </div>
                              {econValor > 0 && (
                                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 block">
                                  -R$ {econValor.toFixed(2)}/un
                                </span>
                              )}
                              {(op.ultimoFornecedor || (op as any).ultimo_fornecedor) && (
                                <span 
                                  className="text-[10px] text-slate-400 dark:text-slate-500 block truncate max-w-[140px]" 
                                >
                                  🏢 {op.ultimoFornecedor || (op as any).ultimo_fornecedor}
                                </span>
                              )}
                            </button>

                            {/* Card / Tooltip de Auditoria Completa Digifarma */}
                            <div className={`absolute left-0 bottom-full mb-2 z-50 w-72 p-3.5 rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-700 pointer-events-auto transition-all ${
                              auditoriaAbertaId === op.id ? 'block scale-100 opacity-100' : 'hidden group-hover:block scale-95 group-hover:scale-100 group-hover:opacity-100'
                            }`}>
                              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                                <span className="text-blue-400 text-[11px] font-black uppercase tracking-wider">
                                  🧾 Auditoria Digifarma
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 font-bold border border-blue-800">
                                  NF Entrada
                                </span>
                              </div>

                              <div className="space-y-1.5 text-xs">
                                <div>
                                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Valor Unitário Real</span>
                                  <span className="text-emerald-400 font-black text-sm">
                                    R$ {precoUlt.toFixed(2)}/un
                                  </span>
                                </div>

                                {(op.dataUltCompra || (op as any).data_ult_compra) && (
                                  <div>
                                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Data da Compra</span>
                                    <span className="font-bold text-slate-200">
                                      📅 {formatarData(op.dataUltCompra || (op as any).data_ult_compra)}
                                    </span>
                                  </div>
                                )}

                                {(op.ultimoFornecedor || (op as any).ultimo_fornecedor) && (
                                  <div>
                                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Fornecedor / Distribuidora</span>
                                    <span className="font-bold text-slate-200 truncate block">
                                      🏢 {op.ultimoFornecedor || (op as any).ultimo_fornecedor}
                                    </span>
                                  </div>
                                )}

                                {(op.notaFiscalUltCompra || (op as any).nota_fiscal_ult_compra) && (
                                  <div>
                                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Número da Nota Fiscal</span>
                                    <span className="font-bold text-amber-300 font-mono">
                                      {String(op.notaFiscalUltCompra || (op as any).nota_fiscal_ult_compra).startsWith('NF')
                                        ? String(op.notaFiscalUltCompra || (op as any).nota_fiscal_ult_compra)
                                        : `NF ${op.notaFiscalUltCompra || (op as any).nota_fiscal_ult_compra}`}
                                    </span>
                                  </div>
                                )}

                                {((op as any).embalagemUltCompra || (op as any).embalagem_ult_compra) && (() => {
                                  const rawEmb = String((op as any).embalagemUltCompra || (op as any).embalagem_ult_compra);
                                  const embText = rawEmb.startsWith('Embalagem:') ? rawEmb : `Embalagem: ${rawEmb}`;
                                  const pTot = (op as any).precoTotalNota || (op as any).preco_total_nota;
                                  const needTotal = pTot && precoUlt && Math.abs(pTot - precoUlt) > 0.01 && !embText.includes('total)') && !embText.includes('R$');
                                  return (
                                    <div className="pt-1.5 border-t border-slate-800 text-[11px] text-slate-300">
                                      📦 {embText}{needTotal ? ` (R$ ${Number(pTot).toFixed(2)} total)` : ''}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-slate-400">Sem Histórico</span>
                        )}
                      </td>

                      {/* Desconto (%) */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {economizou ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-black border border-emerald-300 dark:border-emerald-800 shadow-sm">
                            <TrendingDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            -{op.economiaPercentual?.toFixed(1)}%
                          </span>
                        ) : op.status === 'Descartado_Preco_Maior' ? (
                          <span className="px-2 py-1 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[11px] font-bold">
                            Preço Maior
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">—</span>
                        )}
                      </td>

                      {/* Estoque */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {op.estoqueAtual !== undefined ? (
                          <div className="flex flex-col items-center">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border ${
                              op.estoqueAtual <= 0
                                ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300'
                                : (op.estoqueMinimo && op.estoqueAtual < op.estoqueMinimo
                                  ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300')
                            }`}>
                              {op.estoqueAtual <= 0 ? 'Zerado (0)' : `${op.estoqueAtual} un`}
                            </span>
                            {op.estoqueMinimo ? (
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                Mín: {op.estoqueMinimo}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Justificativa de Compra */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                            justCor === 'red'
                              ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/80 dark:text-red-300 dark:border-red-800'
                              : (justCor === 'amber'
                                ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800'
                                : (justCor === 'emerald'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800'
                                  : (justCor === 'blue'
                                    ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800'
                                    : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700')))
                          }`}>
                            {justBadge}
                          </span>
                          <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300 leading-tight">
                            {justTexto}
                          </p>
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {op.grupoEquivalente && (
                            <button
                              onClick={() => setModalEquivOferta(op.grupoEquivalente)}
                              className="p-2 rounded-xl text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all cursor-pointer"
                              title="Ver produtos e marcas equivalentes"
                            >
                              <Layers className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => handleAbrirGraficoVariacao(op.produtoNome, op.ean)}
                            className="p-2 rounded-xl text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-all cursor-pointer"
                            title="Ver gráfico de variação de preços por fornecedor"
                          >
                            <LineChartIcon className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setChatOportunidadeSelecionada(op)}
                            className="p-2 rounded-xl text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-all cursor-pointer"
                            title="Abrir conversa do WhatsApp com o contexto desta oferta"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>

                          <button
                            onClick={(e) => handleExcluirOportunidade(op.id, e)}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer"
                            title="Descartar esta oferta do radar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleCriarCotacaoComOferta(op)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer active:scale-95"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            Cotar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Transcrição da Oferta */}
      {selectedOferta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400 rounded-2xl">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                    Mensagem Original do WhatsApp
                  </h3>
                  <p className="text-xs font-bold text-slate-400">
                    {selectedOferta.fornecedorNome} {selectedOferta.representanteNome ? `(${selectedOferta.representanteNome})` : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
              {selectedOferta.textoOriginal || 'Texto completo não gravado no histórico.'}
            </div>

            {selectedOferta.precoUltCompraDigifarma && (
              <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-blue-900 dark:text-blue-200">Última Compra Digifarma: </span>
                    <span className="font-extrabold text-blue-700 dark:text-blue-300 text-sm">R$ {selectedOferta.precoUltCompraDigifarma.toFixed(2)}/un</span>
                  </div>
                  {(selectedOferta.dataUltCompra || (selectedOferta as any).data_ult_compra) && (
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold">
                      📅 {formatarData(selectedOferta.dataUltCompra || (selectedOferta as any).data_ult_compra)}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300 border-t border-blue-200/60 dark:border-blue-900/40 pt-2">
                  {(selectedOferta.ultimoFornecedor || (selectedOferta as any).ultimo_fornecedor) && (
                    <div>
                      🏢 Fornecedor: <strong className="text-slate-800 dark:text-slate-100">{selectedOferta.ultimoFornecedor || (selectedOferta as any).ultimo_fornecedor}</strong>
                    </div>
                  )}
                  {(selectedOferta.notaFiscalUltCompra || (selectedOferta as any).nota_fiscal_ult_compra) && (
                    <div>
                      📄 NF: <strong className="text-slate-800 dark:text-slate-100">{selectedOferta.notaFiscalUltCompra || (selectedOferta as any).nota_fiscal_ult_compra}</strong>
                    </div>
                  )}
                  {(selectedOferta.embalagemUltCompra || (selectedOferta as any).embalagem_ult_compra) && (() => {
                    const rawEmb = String(selectedOferta.embalagemUltCompra || (selectedOferta as any).embalagem_ult_compra);
                    const pTot = selectedOferta.precoTotalNota || (selectedOferta as any).preco_total_nota;
                    const pUlt = selectedOferta.precoUltCompraDigifarma || (selectedOferta as any).preco_ult_compra_digifarma;
                    const needTotal = pTot && pUlt && Math.abs(pTot - pUlt) > 0.01 && !rawEmb.includes('total)') && !rawEmb.includes('R$');
                    return (
                      <div>
                        📦 Embalagem: <strong className="text-slate-800 dark:text-slate-100">{rawEmb}</strong>
                        {needTotal ? (
                          <span className="text-slate-500 dark:text-slate-400 font-semibold"> (R$ {Number(pTot).toFixed(2)} total)</span>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end">
              <button
                onClick={() => setSelectedOferta(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gráfico de Variação de Preço por Fornecedor */}
      {modalGraficoProduto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-4xl p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-2xl">
                  <LineChartIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                    Variação de Preço por Fornecedor
                  </h3>
                  <p className="text-xs font-bold text-slate-400">
                    {modalGraficoProduto}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setModalGraficoProduto(null)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingGrafico ? (
              <div className="py-16 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span>Carregando histórico e cotações de fornecedores...</span>
              </div>
            ) : dadosGrafico ? (
              <div className="space-y-4">
                {/* Cards de Resumo */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Última Compra (Digifarma)</span>
                    <span className="text-lg font-black text-slate-900 dark:text-slate-100 block mt-0.5">
                      {dadosGrafico.precoReferencia ? `R$ ${dadosGrafico.precoReferencia.toFixed(2)}/un` : 'Sem Histórico'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Menor Preço Ofertado</span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                        {dadosGrafico.menorPreco ? `R$ ${dadosGrafico.menorPreco.preco.toFixed(2)}` : '—'}
                      </span>
                      {dadosGrafico.menorPreco && (
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 truncate">
                          • {dadosGrafico.menorPreco.fornecedor}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                    <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block">Fornecedores Mapeados</span>
                    <span className="text-lg font-black text-blue-700 dark:text-blue-300 block mt-0.5">
                      {dadosGrafico.fornecedores?.length || 0} distribuidores ({dadosGrafico.totalOfertas || 0} cotações)
                    </span>
                  </div>
                </div>

                {/* Gráfico Recharts */}
                {dadosGrafico.pontos && dadosGrafico.pontos.length > 0 ? (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dadosGrafico.pontos} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                          <XAxis dataKey="data" stroke="#64748b" fontSize={11} />
                          <YAxis stroke="#64748b" fontSize={11} domain={['dataMin - 0.5', 'dataMax + 0.5']} tickFormatter={(v) => `R$ ${v.toFixed(2)}`} />
                          <RechartsTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const pt = payload[0].payload;
                                return (
                                  <div className="p-3 rounded-xl bg-slate-900 text-white border border-slate-700 shadow-xl text-xs space-y-1">
                                    <p className="font-bold text-slate-300">{pt.dataHora ? new Date(pt.dataHora).toLocaleString('pt-BR') : pt.data}</p>
                                    <p className="font-extrabold text-emerald-400 text-sm">R$ {pt.preco?.toFixed(2)}</p>
                                    <p className="text-slate-300">🏢 {pt.fornecedor}</p>
                                    {pt.representante && <p className="text-slate-400 text-[10px]">👤 {pt.representante}</p>}
                                    {pt.tipo === 'compra_real' && <p className="text-blue-300 text-[10px] font-bold">🛒 Compra Real Digifarma</p>}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          {dadosGrafico.precoReferencia && (
                            <ReferenceLine
                              y={dadosGrafico.precoReferencia}
                              stroke="#ef4444"
                              strokeDasharray="4 4"
                              label={{ value: `Ref: R$ ${dadosGrafico.precoReferencia.toFixed(2)}`, fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }}
                            />
                          )}
                          <Line
                            type="monotone"
                            dataKey="preco"
                            name="Preço Ofertado (R$)"
                            stroke="#10b981"
                            strokeWidth={3}
                            dot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: '#ffffff' }}
                            activeDot={{ r: 7 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400">
                    Ainda não há ofertas suficientes mineradas para este produto. Conforme os representantes enviarem encartes, o histórico de variação aparecerá aqui.
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex items-center justify-end">
              <button
                onClick={() => setModalGraficoProduto(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Colar/Importar Texto de Mensagem de Representante */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 rounded-2xl">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  Colar Oferta / Mensagem do WhatsApp
                </h3>
                <p className="text-xs font-bold text-slate-400">
                  Cole tabelas, encartes ou conversas de representantes para minerar preços e prazos imediatamente.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Nome / Distribuidora (Opcional)
                </label>
                <input
                  type="text"
                  value={manualRepresentante}
                  onChange={(e) => setManualRepresentante(e.target.value)}
                  placeholder="Ex: Carlos (Santa Cruz)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Telefone (Opcional)
                </label>
                <input
                  type="text"
                  value={manualTelefone}
                  onChange={(e) => setManualTelefone(e.target.value)}
                  placeholder="Ex: (32) 99999-8888"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                Texto da Mensagem com Preços / Prazos
              </label>
              <textarea
                value={manualTexto}
                onChange={(e) => setManualTexto(e.target.value)}
                placeholder="Exemplo:&#10;Boa tarde! Ofertas especiais de hoje:&#10;Dipirona 500mg c/ 100 por R$ 1,45&#10;Losartana 50mg 30cp R$ 2,10&#10;Amoxicilina 500mg R$ 18,90&#10;Condições: 28/35/42 dias no boleto, pedido mínimo R$ 500"
                rows={6}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500 leading-relaxed resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsManualModalOpen(false)}
                disabled={processandoManual}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleProcessarTextoManual}
                disabled={processandoManual || !manualTexto.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-black uppercase tracking-wider shadow-lg transition-all disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className={`w-4 h-4 ${processandoManual ? 'animate-spin' : ''}`} />
                {processandoManual ? 'Minerando IA...' : 'Processar e Minerar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes dos Produtos Equivalentes */}
      {modalEquivOferta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                    {modalEquivOferta.nome || modalEquivOferta.nomeGrupo}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Estoque consolidado de marcas equivalentes / genéricos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalEquivOferta(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-center">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Saldo Total</span>
                <span className={`text-lg font-black ${modalEquivOferta.saldoTotal > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                  {modalEquivOferta.saldoTotal} un
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Estoque Mínimo</span>
                <span className="text-lg font-black text-slate-700 dark:text-slate-300">
                  {modalEquivOferta.estMinimoTotal || 0} un
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Menor Compra</span>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  {modalEquivOferta.menorUltimaCompra > 0 ? `R$ ${modalEquivOferta.menorUltimaCompra.toFixed(2)}` : '—'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Marcas e Estoque Atual na Farmácia:
              </span>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                {modalEquivOferta.produtos && modalEquivOferta.produtos.length > 0 ? (
                  modalEquivOferta.produtos.map((p: any) => (
                    <div key={p.produto_id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">{p.descricao}</span>
                        <span className="text-[11px] text-slate-400">ID: {p.produto_id} {p.ean ? `• EAN: ${p.ean}` : ''}</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-black block ${p.saldo > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                          {p.saldo} un
                        </span>
                        {p.ultima_compra_valor > 0 && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                            Últ: R$ {Number(p.ultima_compra_valor).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400">Nenhum produto detalhado encontrado.</div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  setModalEquivOferta(null);
                  if (onNavigateToTab) onNavigateToTab('equivalentes');
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                Gerenciar todos os grupos na aba "Equivalentes" →
              </button>

              <button
                onClick={() => setModalEquivOferta(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visualização da Conversa do WhatsApp com Destaque do Produto */}
      {chatOportunidadeSelecionada && (
        <ComprasChatViewer
          oportunidade={chatOportunidadeSelecionada}
          theme={theme}
          onVoltar={() => setChatOportunidadeSelecionada(null)}
          onCriarCotacao={(op) => {
            handleCriarCotacaoComOferta(op);
            setChatOportunidadeSelecionada(null);
          }}
        />
      )}
    </div>
  );
};
