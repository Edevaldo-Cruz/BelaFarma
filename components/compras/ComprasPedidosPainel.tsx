import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingBag, 
  DollarSign, 
  Calendar, 
  FileText, 
  Copy, 
  Printer, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Sliders, 
  Clock, 
  Building2, 
  Phone, 
  CreditCard, 
  Trash2, 
  PlusCircle, 
  X, 
  ExternalLink,
  Wallet,
  TrendingDown,
  TrendingUp,
  Percent,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  ListFilter,
  Ban
} from 'lucide-react';
import { 
  PedidoCompraFormal, 
  OrcamentoResumo, 
  User, 
  ExtratoOrcamentarioResponse, 
  MovimentacaoExtrato, 
  BoletoExtratoMes 
} from '../../types';
import { useToast } from '../ToastContext';

interface ComprasPedidosPainelProps {
  user: User;
  theme: 'light' | 'dark';
  preselectedData?: any[];
  onNavigateToTab?: (tab: string) => void;
}

const MESES_NOMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const ComprasPedidosPainel: React.FC<ComprasPedidosPainelProps> = ({
  user,
  theme,
  preselectedData,
  onNavigateToTab
}) => {
  const { addToast } = useToast();
  
  // Controle de Período
  const [mes, setMes] = useState<number>(new Date().getMonth() + 1);
  const [ano, setAno] = useState<number>(new Date().getFullYear());

  // Dados do Extrato
  const [extrato, setExtrato] = useState<ExtratoOrcamentarioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filtros de visualização do extrato
  const [busca, setBusca] = useState('');
  const [filtroDistribuidora, setFiltroDistribuidora] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'DEBITOS' | 'CANCELADOS'>('TODOS');
  const [viewMode, setViewMode] = useState<'EXTRATO' | 'BOLETOS_MES'>('EXTRATO');

  // Detalhes / Modais
  const [selectedMovimentacao, setSelectedMovimentacao] = useState<MovimentacaoExtrato | null>(null);
  const [isDetalhesModalOpen, setIsDetalhesModalOpen] = useState(false);
  const [isOrcamentoModalOpen, setIsOrcamentoModalOpen] = useState(false);
  const [novoTetoOrcamento, setNovoTetoOrcamento] = useState<number>(0);

  // Modal Cancelar Pedido
  const [isCancelarModalOpen, setIsCancelarModalOpen] = useState(false);
  const [pedidoParaCancelar, setPedidoParaCancelar] = useState<MovimentacaoExtrato | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');

  // Modal: Criar Pedido Direto
  const [isNovoPedidoModalOpen, setIsNovoPedidoModalOpen] = useState(false);
  const [formNovoPedido, setFormNovoPedido] = useState({
    distribuidora: '',
    representante: '',
    telefone: '',
    condicaoPagamento: '28/35/42 dias',
    previsaoEntrega: '2 dias úteis',
    itens: [] as Array<{ descricao: string; ean: string; quantidade: number; precoUnitario: number; subtotal: number }>
  });

  const [itemTemp, setItemTemp] = useState({
    descricao: '',
    ean: '',
    quantidade: 10,
    precoUnitario: 10.00
  });

  // Carrega o extrato de compras e orçamento
  const carregarExtrato = async (m: number = mes, a: number = ano) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        mes: String(m),
        ano: String(a)
      });
      if (filtroDistribuidora) params.append('distribuidora', filtroDistribuidora);
      if (busca) params.append('busca', busca);

      const res = await fetch(`/api/central-compras/pedidos/extrato?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setExtrato(data.data);
          setNovoTetoOrcamento(data.data.limiteMensal || 0);
        }
      } else {
        // Fallback para rotas tradicionais se necessário
        const resOrc = await fetch(`/api/central-compras/orcamento?mes=${m}&ano=${a}`);
        const resPed = await fetch(`/api/central-compras/pedidos?mes=${m}&ano=${a}`);
        if (resOrc.ok && resPed.ok) {
          const dataOrc = await resOrc.json();
          const dataPed = await resPed.json();
          // Constrói extrato básico
          const pedidosList = dataPed.data?.pedidos || dataPed.data || [];
          let saldoAcc = dataOrc.data?.limiteMensal || 0;
          const movs: MovimentacaoExtrato[] = [
            {
              id: `abertura-${m}-${a}`,
              data: `${a}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`,
              tipo: 'CREDITO_INICIAL',
              tipoFormatado: 'Crédito Mensal',
              numeroPedido: '---',
              distribuidora: 'Teto Orçamentário BelaFarma',
              descricao: `Crédito / Teto Orçamentário (${String(m).padStart(2, '0')}/${a})`,
              valor: dataOrc.data?.limiteMensal || 0,
              valorMovimento: dataOrc.data?.limiteMensal || 0,
              saldoApos: saldoAcc,
              status: 'Confirmado',
              isDebito: false,
              isCredito: true,
              isEstorno: false,
              itens: [],
              boletos: []
            }
          ];
          for (const p of pedidosList) {
            const isCanc = String(p.status).toLowerCase() === 'cancelado';
            if (!isCanc) {
              saldoAcc -= Number(p.valorTotal || 0);
            }
            movs.push({
              id: p.id,
              data: p.createdAt,
              tipo: isCanc ? 'ESTORNO_CANCELAMENTO' : 'DEBITO_PEDIDO',
              tipoFormatado: isCanc ? 'Pedido Cancelado' : 'Pedido de Compra',
              numeroPedido: p.numeroPedido,
              distribuidora: p.distribuidora,
              representante: p.representante,
              telefone: p.telefone,
              descricao: `Pedido #${p.numeroPedido} - ${p.distribuidora}`,
              condicaoPagamento: p.condicaoPagamento,
              previsaoEntrega: p.previsaoEntrega,
              valor: Number(p.valorTotal || 0),
              valorMovimento: isCanc ? 0 : -Number(p.valorTotal || 0),
              saldoApos: saldoAcc,
              status: p.status,
              isDebito: !isCanc,
              isCredito: false,
              isEstorno: isCanc,
              itens: p.itens || [],
              boletos: p.boletos || [],
              textoFormatado: p.textoFormatado
            });
          }
          setExtrato({
            mes: m,
            ano: a,
            limiteMensal: dataOrc.data?.limiteMensal || 0,
            totalComprometido: dataOrc.data?.comprometido || 0,
            totalEstornado: 0,
            saldoDisponivel: dataOrc.data?.disponivel || 0,
            percentualUtilizado: dataOrc.data?.percentualUtilizado || 0,
            totalPedidosAtivos: movs.filter(x => x.isDebito).length,
            totalPedidosCancelados: movs.filter(x => x.isEstorno).length,
            movimentacoes: movs.reverse(),
            boletosMes: [],
            totalBoletosMes: 0,
            distribuidoras: Array.from(new Set(pedidosList.map((x: any) => x.distribuidora).filter(Boolean))) as string[]
          });
        }
      }
    } catch (err: any) {
      addToast('Erro ao carregar extrato de pedidos: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarExtrato(mes, ano);
  }, [mes, ano, filtroDistribuidora]);

  // Preenche dados se vier encaminhado de cotação
  useEffect(() => {
    if (preselectedData && preselectedData.length > 0) {
      const primeiro = preselectedData[0];
      setFormNovoPedido({
        distribuidora: primeiro.distribuidora || '',
        representante: primeiro.representante || '',
        telefone: primeiro.telefone || '',
        condicaoPagamento: primeiro.condicaoPagamento || '28/35/42 dias',
        previsaoEntrega: primeiro.previsaoEntrega || '2 dias úteis',
        itens: primeiro.itens || []
      });
      setIsNovoPedidoModalOpen(true);
    }
  }, [preselectedData]);

  // Navegação de Períodos
  const handleMesAnterior = () => {
    if (mes === 1) {
      setMes(12);
      setAno(a => a - 1);
    } else {
      setMes(m => m - 1);
    }
  };

  const handleMesProximo = () => {
    if (mes === 12) {
      setMes(1);
      setAno(a => a + 1);
    } else {
      setMes(m => m + 1);
    }
  };

  const handleMesAtual = () => {
    const hoje = new Date();
    setMes(hoje.getMonth() + 1);
    setAno(hoje.getFullYear());
  };

  // Salvar Teto Orçamentário
  const handleSalvarTetoOrcamentario = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/central-compras/orcamento/definir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mes,
          ano,
          limite: novoTetoOrcamento
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast('✅ Teto orçamentário mensal atualizado com sucesso!', 'success');
        setIsOrcamentoModalOpen(false);
        carregarExtrato(mes, ano);
      } else {
        addToast('Erro ao salvar teto: ' + (data.error || 'Falha no servidor'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Cancelar / Estornar Pedido
  const handleConfirmarCancelamento = async () => {
    if (!pedidoParaCancelar) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/central-compras/pedidos/${pedidoParaCancelar.id}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoCancelamento || 'Cancelado pelo usuário' })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast('✅ Pedido cancelado e estornado do orçamento!', 'success');
        setIsCancelarModalOpen(false);
        setPedidoParaCancelar(null);
        setMotivoCancelamento('');
        carregarExtrato(mes, ano);
      } else {
        addToast('Erro ao cancelar: ' + (data.error || 'Falha no servidor'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Criar Pedido Direto
  const handleAddItemNovoPedido = () => {
    if (!itemTemp.descricao.trim() || itemTemp.precoUnitario <= 0) {
      addToast('Preencha a descrição e preço unitário válido.', 'warning');
      return;
    }
    const subtotal = itemTemp.quantidade * itemTemp.precoUnitario;
    setFormNovoPedido(p => ({
      ...p,
      itens: [...p.itens, { ...itemTemp, subtotal }]
    }));
    setItemTemp({ descricao: '', ean: '', quantidade: 10, precoUnitario: 10.00 });
  };

  const handleCriarPedidoDireto = async () => {
    if (!formNovoPedido.distribuidora.trim() || formNovoPedido.itens.length === 0) {
      addToast('Informe a distribuidora e adicione ao menos um item.', 'warning');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/central-compras/pedidos/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formNovoPedido,
          enfileirarAprovacao: true,
          vincularBoletos: true,
          criadoPor: user.name
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast('✅ Espelho de Pedido de Compra gerado com sucesso e enviado para a Fila de Aprovação!', 'success');
        setIsNovoPedidoModalOpen(false);
        setFormNovoPedido({
          distribuidora: '',
          representante: '',
          telefone: '',
          condicaoPagamento: '28/35/42 dias',
          previsaoEntrega: '2 dias úteis',
          itens: []
        });
        carregarExtrato(mes, ano);
      } else {
        addToast('Erro ao gerar pedido: ' + (data.error || 'Falha no servidor'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCopiarTexto = (texto?: string) => {
    if (!texto) {
      addToast('Texto não disponível para cópia.', 'warning');
      return;
    }
    navigator.clipboard.writeText(texto);
    addToast('📋 Espelho do Pedido copiado para a área de transferência!', 'success');
  };

  const handleImprimirExtrato = () => {
    window.print();
  };

  const movimentacoesFiltradas = useMemo(() => {
    if (!extrato?.movimentacoes) return [];
    return extrato.movimentacoes.filter(m => {
      // Filtro de tipo
      if (filtroTipo === 'DEBITOS' && !m.isDebito) return false;
      if (filtroTipo === 'CANCELADOS' && !m.isEstorno) return false;

      // Filtro de busca local
      if (busca) {
        const b = busca.toLowerCase();
        const match = (
          m.numeroPedido.toLowerCase().includes(b) ||
          m.distribuidora.toLowerCase().includes(b) ||
          (m.representante && m.representante.toLowerCase().includes(b)) ||
          (m.itens && m.itens.some(it => it.descricao.toLowerCase().includes(b) || (it.ean && it.ean.includes(b))))
        );
        if (!match) return false;
      }
      return true;
    });
  }, [extrato, filtroTipo, busca]);

  const valorTotalNovoPedido = useMemo(() => {
    return formNovoPedido.itens.reduce((acc, it) => acc + it.subtotal, 0);
  }, [formNovoPedido.itens]);

  const formatarMoeda = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* ────────────────────────────────────────────────────────── */}
      {/* CABEÇALHO DO EXTRATO COM SELETOR DE PERÍODO & AÇÕES       */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-red-600 to-orange-600 text-white shadow-md">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300">
                  Extrato Contábil & Orçamento
                </span>
                <span className="text-xs font-mono font-bold text-slate-400">
                  {MESES_NOMES[mes - 1]} / {ano}
                </span>
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                Extrato de Pedidos & Saldo de Compras
              </h2>
              <p className="text-xs text-slate-400 font-bold">
                Movimentações financeiras, débitos por pedido emitido e projeção de boletos deduzidos
              </p>
            </div>
          </div>

          {/* Navegador de Mês / Ano */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={handleMesAnterior}
                title="Mês Anterior"
                className="p-2 rounded-xl hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="px-3 flex items-center gap-2">
                <select
                  value={mes}
                  onChange={(e) => setMes(parseInt(e.target.value, 10))}
                  className="bg-transparent text-xs font-black text-slate-900 dark:text-white cursor-pointer focus:outline-none"
                >
                  {MESES_NOMES.map((nome, i) => (
                    <option key={i + 1} value={i + 1} className="dark:bg-slate-800 dark:text-white">
                      {nome}
                    </option>
                  ))}
                </select>
                <span className="text-slate-400 text-xs font-bold">/</span>
                <select
                  value={ano}
                  onChange={(e) => setAno(parseInt(e.target.value, 10))}
                  className="bg-transparent text-xs font-black text-slate-900 dark:text-white cursor-pointer focus:outline-none"
                >
                  {[2024, 2025, 2026, 2027, 2028].map(a => (
                    <option key={a} value={a} className="dark:bg-slate-800 dark:text-white">
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleMesProximo}
                title="Próximo Mês"
                className="p-2 rounded-xl hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleMesAtual}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
            >
              Mês Atual
            </button>

            <button
              onClick={() => setIsOrcamentoModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              Ajustar Teto
            </button>

            <button
              onClick={() => setIsNovoPedidoModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Novo Pedido
            </button>
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────── */}
        {/* CARDS DE SALDO E BALANÇO DO EXTRATO                       */}
        {/* ────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          {/* Card 1: Crédito / Teto Mensal */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/40 dark:from-slate-800/80 dark:to-slate-800/40 border border-blue-100 dark:border-slate-700/60 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">
                Crédito Mensal (Teto)
              </span>
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-2">
              {formatarMoeda(extrato?.limiteMensal)}
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Limite autorizado para compras no mês
            </div>
          </div>

          {/* Card 2: Total Débitos em Pedidos */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/40 dark:from-slate-800/80 dark:to-slate-800/40 border border-amber-100 dark:border-slate-700/60 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Total Débitos (Pedidos)
              </span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-2">
              - {formatarMoeda(extrato?.totalComprometido)}
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 flex items-center justify-between">
              <span>{extrato?.totalPedidosAtivos || 0} pedidos ativos</span>
              <span className="font-bold">{extrato?.percentualUtilizado?.toFixed(1)}% do teto</span>
            </div>
          </div>

          {/* Card 3: Saldo Disponível Restante */}
          <div className={`p-4 rounded-2xl border relative overflow-hidden ${
            (extrato?.saldoDisponivel || 0) >= 0
              ? 'bg-gradient-to-br from-emerald-50 to-teal-50/40 dark:from-slate-800/80 dark:to-slate-800/40 border-emerald-200 dark:border-slate-700/60'
              : 'bg-gradient-to-br from-red-50 to-rose-50/40 dark:from-red-950/30 dark:to-slate-800/40 border-red-300 dark:border-red-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-black uppercase tracking-wider ${
                (extrato?.saldoDisponivel || 0) >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
              }`}>
                Saldo Disponível
              </span>
              <div className={`p-1.5 rounded-lg ${
                (extrato?.saldoDisponivel || 0) >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400 animate-pulse'
              }`}>
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className={`text-xl font-black mt-2 ${
              (extrato?.saldoDisponivel || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400 font-black'
            }`}>
              {formatarMoeda(extrato?.saldoDisponivel)}
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              {(extrato?.saldoDisponivel || 0) >= 0 ? 'Margem restante para compras' : '⚠️ TETO ORÇAMENTÁRIO EXCEDIDO'}
            </div>
          </div>

          {/* Card 4: Projeção de Boletos no Mês */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-violet-50/40 dark:from-slate-800/80 dark:to-slate-800/40 border border-purple-100 dark:border-slate-700/60 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300">
                Boletos a Vencer no Mês
              </span>
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-black text-purple-700 dark:text-purple-300 mt-2">
              {formatarMoeda(extrato?.totalBoletosMes)}
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 flex items-center justify-between">
              <span>{extrato?.boletosMes?.length || 0} parcelas no Contas a Pagar</span>
              <button 
                onClick={() => setViewMode('BOLETOS_MES')}
                className="text-[10px] font-black uppercase text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
              >
                Ver Lista
              </button>
            </div>
          </div>
        </div>

        {/* Barra de Progresso Visual de Orçamento */}
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-slate-400" />
              Consumo do Crédito Mensal:
            </span>
            <span className={`font-black ${
              (extrato?.percentualUtilizado || 0) > 100 ? 'text-red-600 dark:text-red-400' :
              (extrato?.percentualUtilizado || 0) > 80 ? 'text-amber-600 dark:text-amber-400' :
              'text-emerald-600 dark:text-emerald-400'
            }`}>
              {extrato?.percentualUtilizado?.toFixed(1)}% ({formatarMoeda(extrato?.totalComprometido)} de {formatarMoeda(extrato?.limiteMensal)})
            </span>
          </div>
          <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${
                (extrato?.percentualUtilizado || 0) > 100 ? 'bg-gradient-to-r from-red-500 to-rose-600 animate-pulse' :
                (extrato?.percentualUtilizado || 0) > 80 ? 'bg-gradient-to-r from-amber-500 to-orange-500' :
                'bg-gradient-to-r from-emerald-500 to-teal-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, extrato?.percentualUtilizado || 0))}%` }}
            />
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* BARRA DE FERRAMENTAS & FILTROS DO EXTRATO                  */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Toggle de Visualização: Extrato vs Boletos */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full md:w-auto">
          <button
            onClick={() => setViewMode('EXTRATO')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
              viewMode === 'EXTRATO'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            📜 Extrato de Movimentações ({movimentacoesFiltradas.length})
          </button>
          <button
            onClick={() => setViewMode('BOLETOS_MES')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
              viewMode === 'BOLETOS_MES'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            💳 Boletos do Mês ({extrato?.boletosMes?.length || 0})
          </button>
        </div>

        {/* Filtros rápidos e busca */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {/* Busca por texto */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar pedido, distribuidora, item..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/20"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtro Distribuidora */}
          {extrato?.distribuidoras && extrato.distribuidoras.length > 0 && (
            <select
              value={filtroDistribuidora}
              onChange={(e) => setFiltroDistribuidora(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              <option value="">Todas Distribuidoras</option>
              {extrato.distribuidoras.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}

          {/* Filtro de Tipo de Movimento */}
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
          >
            <option value="TODOS">Todos os Lançamentos</option>
            <option value="DEBITOS">Apenas Pedidos Ativos</option>
            <option value="CANCELADOS">Apenas Estornos / Cancelados</option>
          </select>

          {/* Botão Recarregar */}
          <button
            onClick={() => carregarExtrato(mes, ano)}
            title="Recarregar Extrato"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Botão Imprimir */}
          <button
            onClick={handleImprimirExtrato}
            title="Imprimir Extrato"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* CORPO: TABELA DE EXTRATO (LEDGER) OU LISTA DE BOLETOS     */}
      {/* ────────────────────────────────────────────────────────── */}
      {viewMode === 'EXTRATO' ? (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="py-3.5 px-4">Data / Hora</th>
                  <th className="py-3.5 px-3">Tipo</th>
                  <th className="py-3.5 px-3">Nº Doc / Pedido</th>
                  <th className="py-3.5 px-4">Distribuidora / Descrição</th>
                  <th className="py-3.5 px-3">Condição & Prazos</th>
                  <th className="py-3.5 px-3 text-right">Valor do Lançamento</th>
                  <th className="py-3.5 px-4 text-right">Saldo Orçamentário</th>
                  <th className="py-3.5 px-3 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {movimentacoesFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                      Nenhuma movimentação encontrada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  movimentacoesFiltradas.map((mov) => {
                    const isCredito = mov.isCredito;
                    const isEstorno = mov.isEstorno;
                    const isDebito = mov.isDebito;

                    return (
                      <tr 
                        key={mov.id}
                        className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${
                          isCredito ? 'bg-blue-50/30 dark:bg-blue-950/20 font-bold' :
                          isEstorno ? 'bg-rose-50/20 dark:bg-red-950/10 opacity-75' : ''
                        }`}
                      >
                        {/* Data */}
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(mov.data).toLocaleDateString('pt-BR')} <span className="text-[10px] text-slate-400">{new Date(mov.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </td>

                        {/* Tipo de Lançamento */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {isCredito && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                              <ArrowUpRight className="w-3 h-3" /> Crédito Inicial
                            </span>
                          )}
                          {isDebito && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              <ArrowDownRight className="w-3 h-3" /> Pedido Compra
                            </span>
                          )}
                          {isEstorno && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                              <Ban className="w-3 h-3" /> Cancelado / Estorno
                            </span>
                          )}
                        </td>

                        {/* Nº Doc */}
                        <td className="py-3.5 px-3 font-mono text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {mov.numeroPedido}
                        </td>

                        {/* Distribuidora / Descrição */}
                        <td className="py-3.5 px-4">
                          <div className="font-black text-slate-900 dark:text-white">
                            {mov.distribuidora}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {mov.representante && mov.representante !== '---' ? `Rep: ${mov.representante}` : mov.descricao}
                            {mov.itens && mov.itens.length > 0 && ` • ${mov.itens.length} produto(s)`}
                          </div>
                        </td>

                        {/* Condição de Pagamento */}
                        <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400 text-[11px] whitespace-nowrap">
                          {mov.condicaoPagamento || '---'}
                        </td>

                        {/* Valor do Lançamento */}
                        <td className="py-3.5 px-3 text-right font-mono text-xs font-black whitespace-nowrap">
                          {isCredito && (
                            <span className="text-blue-600 dark:text-blue-400">
                              + {formatarMoeda(mov.valor)}
                            </span>
                          )}
                          {isDebito && (
                            <span className="text-amber-600 dark:text-amber-400">
                              - {formatarMoeda(mov.valor)}
                            </span>
                          )}
                          {isEstorno && (
                            <span className="text-slate-400 line-through">
                              {formatarMoeda(mov.valor)}
                            </span>
                          )}
                        </td>

                        {/* Saldo Orçamentário Resultante */}
                        <td className="py-3.5 px-4 text-right font-mono text-xs font-black whitespace-nowrap">
                          <span className={`${mov.saldoApos >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>
                            {formatarMoeda(mov.saldoApos)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            mov.status === 'Confirmado' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' :
                            mov.status === 'Enviado' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                            mov.status === 'Aprovado' ? 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300' :
                            mov.status === 'Cancelado' ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300' :
                            'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}>
                            {mov.status}
                          </span>
                        </td>

                        {/* Ações */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {!isCredito ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Ver Detalhes */}
                              <button
                                onClick={() => {
                                  setSelectedMovimentacao(mov);
                                  setIsDetalhesModalOpen(true);
                                }}
                                title="Visualizar Detalhes e Itens"
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Copiar WhatsApp */}
                              {mov.textoFormatado && (
                                <button
                                  onClick={() => handleCopiarTexto(mov.textoFormatado)}
                                  title="Copiar Espelho para WhatsApp"
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400 cursor-pointer"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Cancelar / Estornar */}
                              {isDebito && (
                                <button
                                  onClick={() => {
                                    setPedidoParaCancelar(mov);
                                    setIsCancelarModalOpen(true);
                                  }}
                                  title="Cancelar e Estornar Pedido"
                                  className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-600 dark:text-red-400 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Abertura</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Rodapé Resumo do Extrato */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs gap-3">
            <div className="text-slate-500 dark:text-slate-400">
              Exibindo <span className="font-bold text-slate-900 dark:text-white">{movimentacoesFiltradas.length}</span> registros de movimentação em <span className="font-bold text-slate-900 dark:text-white">{MESES_NOMES[mes - 1]}/{ano}</span>
            </div>
            <div className="flex items-center gap-4 font-mono font-bold">
              <span className="text-slate-500">Total Faturado no Mês: <span className="text-amber-600 dark:text-amber-400">{formatarMoeda(extrato?.totalComprometido)}</span></span>
              <span className="text-slate-500">Saldo Final: <span className={`${(extrato?.saldoDisponivel || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>{formatarMoeda(extrato?.saldoDisponivel)}</span></span>
            </div>
          </div>
        </div>
      ) : (
        /* ────────────────────────────────────────────────────────── */
        /* ABA: BOLETOS PROJETADOS NO MÊS                             */
        /* ────────────────────────────────────────────────────────── */
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-purple-600" />
                Projeção de Boletos com Vencimento em {MESES_NOMES[mes - 1]}/{ano}
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Parcelas faturadas nos pedidos de compras integradas ao Contas a Pagar
              </p>
            </div>

            <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-800 text-right">
              <span className="text-[10px] font-black uppercase text-purple-600 dark:text-purple-400 block">Total de Boletos no Mês</span>
              <span className="text-lg font-black text-purple-700 dark:text-purple-300">
                {formatarMoeda(extrato?.totalBoletosMes)}
              </span>
            </div>
          </div>

          {(!extrato?.boletosMes || extrato.boletosMes.length === 0) ? (
            <div className="py-12 text-center text-slate-400 font-bold text-xs">
              Nenhum boleto projetado com vencimento para {MESES_NOMES[mes - 1]}/{ano}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400">
                    <th className="py-3 px-3">Data de Vencimento</th>
                    <th className="py-3 px-3">Distribuidora / Fornecedor</th>
                    <th className="py-3 px-3">Nº Pedido Origem</th>
                    <th className="py-3 px-3 text-right">Valor da Parcela</th>
                    <th className="py-3 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {extrato.boletosMes.map((bol) => (
                    <tr key={bol.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {new Date(bol.vencimento).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3 px-3 font-black text-slate-900 dark:text-white">
                        {bol.distribuidora}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500">
                        {bol.numeroPedido}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-purple-700 dark:text-purple-300">
                        {formatarMoeda(bol.valor)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          bol.status === 'Pago' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                          bol.status === 'Vencido' ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300' :
                          'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}>
                          {bol.status || 'Pendente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: DETALHES COMPLETOS DO PEDIDO (ESPELHO, ITENS, BOLETOS)*/}
      {/* ────────────────────────────────────────────────────────── */}
      {isDetalhesModalOpen && selectedMovimentacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-3xl p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-400">DETALHES DO PEDIDO</span>
                  <span className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-wider">{selectedMovimentacao.numeroPedido}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                    selectedMovimentacao.status === 'Enviado' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                    selectedMovimentacao.status === 'Cancelado' ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300' :
                    'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  }`}>
                    {selectedMovimentacao.status}
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                  {selectedMovimentacao.distribuidora}
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {selectedMovimentacao.representante ? `Representante: ${selectedMovimentacao.representante} • ` : ''}
                  {selectedMovimentacao.telefone ? `Tel: ${selectedMovimentacao.telefone} • ` : ''}
                  Condição: {selectedMovimentacao.condicaoPagamento || '28 dias'} • 
                  Previsão: {selectedMovimentacao.previsaoEntrega || '2 dias úteis'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedMovimentacao.textoFormatado && (
                  <button
                    onClick={() => handleCopiarTexto(selectedMovimentacao.textoFormatado)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar WhatsApp
                  </button>
                )}
                <button
                  onClick={() => setIsDetalhesModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Grade de Produtos */}
            <div className="space-y-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                Itens e Medicamentos ({selectedMovimentacao.itens?.length || 0})
              </span>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400">
                      <th className="py-2 px-2">Código / EAN</th>
                      <th className="py-2 px-2">Descrição</th>
                      <th className="py-2 px-2 text-right">Qtd</th>
                      <th className="py-2 px-2 text-right">Preço Unit.</th>
                      <th className="py-2 px-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(selectedMovimentacao.itens || []).map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-2 font-mono text-[11px] text-slate-400">
                          #{it.codigoDigifarma || '---'} {it.ean ? `[${it.ean}]` : ''}
                        </td>
                        <td className="py-2.5 px-2 font-black text-slate-800 dark:text-slate-200">
                          {it.descricao}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                          {it.quantidade} un
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-700 dark:text-slate-300">
                          R$ {it.precoUnitario?.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-black text-slate-900 dark:text-white">
                          R$ {it.subtotal?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-sm">
                <span className="font-black text-slate-500 uppercase">Valor Total do Pedido:</span>
                <span className="text-xl font-black text-slate-900 dark:text-white">
                  {formatarMoeda(selectedMovimentacao.valor)}
                </span>
              </div>
            </div>

            {/* Projeção de Boletos */}
            {selectedMovimentacao.boletos && selectedMovimentacao.boletos.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-purple-500" />
                  Boletos Vinculados ao Contas a Pagar ({selectedMovimentacao.condicaoPagamento})
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {selectedMovimentacao.boletos.map((bol, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 block">Parcela {bol.parcela} ({bol.dias} dias)</span>
                      <div className="font-black text-slate-800 dark:text-slate-200">
                        {formatarMoeda(bol.valor)}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        Venc: {new Date(bol.vencimento).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Motivo Cancelamento se houver */}
            {selectedMovimentacao.motivoCancelamento && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                <span className="font-bold block">Motivo do Cancelamento:</span>
                {selectedMovimentacao.motivoCancelamento}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: AJUSTAR TETO ORÇAMENTÁRIO                          */}
      {/* ────────────────────────────────────────────────────────── */}
      {isOrcamentoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Definir Teto / Crédito Orçamentário Mensal
            </h3>
            <p className="text-xs text-slate-400 font-bold">
              Mês de Referência: {MESES_NOMES[mes - 1]} / {ano}
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Limite Mensal Máximo para Compras (R$)
              </label>
              <input
                type="number"
                step="500"
                value={novoTetoOrcamento}
                onChange={(e) => setNovoTetoOrcamento(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-base font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4">
              <button
                onClick={() => setIsOrcamentoModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarTetoOrcamentario}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Salvar Teto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: CANCELAR E ESTORNAR PEDIDO                          */}
      {/* ────────────────────────────────────────────────────────── */}
      {isCancelarModalOpen && pedidoParaCancelar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Cancelar Pedido de Compra
                </h3>
                <p className="text-xs text-slate-400 font-bold">
                  {pedidoParaCancelar.numeroPedido} - {pedidoParaCancelar.distribuidora}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              O cancelamento irá estornar o valor de <strong className="text-slate-900 dark:text-white">{formatarMoeda(pedidoParaCancelar.valor)}</strong> recompondo o seu saldo orçamentário mensal e cancelando os boletos pendentes.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Motivo do Cancelamento
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Fornecedor sem estoque, troca de distribuidora..."
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setIsCancelarModalOpen(false);
                  setPedidoParaCancelar(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400 cursor-pointer"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmarCancelamento}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: CRIAR NOVO PEDIDO DIRETO                            */}
      {/* ────────────────────────────────────────────────────────── */}
      {isNovoPedidoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Gerar Novo Pedido de Compra Formal
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Distribuidora</label>
                <input
                  type="text"
                  placeholder="Ex: Santa Cruz, Profarma..."
                  value={formNovoPedido.distribuidora}
                  onChange={(e) => setFormNovoPedido(p => ({ ...p, distribuidora: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Representante</label>
                <input
                  type="text"
                  placeholder="Nome do representante"
                  value={formNovoPedido.representante}
                  onChange={(e) => setFormNovoPedido(p => ({ ...p, representante: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Telefone WhatsApp</label>
                <input
                  type="text"
                  placeholder="Ex: 553299999999"
                  value={formNovoPedido.telefone}
                  onChange={(e) => setFormNovoPedido(p => ({ ...p, telefone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Condição de Pagamento</label>
                <input
                  type="text"
                  placeholder="Ex: 28/35/42 dias"
                  value={formNovoPedido.condicaoPagamento}
                  onChange={(e) => setFormNovoPedido(p => ({ ...p, condicaoPagamento: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Adicionar Itens */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 block">Adicionar Produto</span>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    placeholder="Descrição do medicamento"
                    value={itemTemp.descricao}
                    onChange={(e) => setItemTemp(p => ({ ...p, descricao: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Preço Unit (R$)"
                    value={itemTemp.precoUnitario}
                    onChange={(e) => setItemTemp(p => ({ ...p, precoUnitario: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="Qtd"
                    value={itemTemp.quantidade}
                    onChange={(e) => setItemTemp(p => ({ ...p, quantidade: parseInt(e.target.value, 10) || 1 }))}
                    className="w-16 px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-center text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddItemNovoPedido}
                    className="px-3 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Resumo dos Itens Adicionados */}
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {formNovoPedido.itens.map((it, idx) => (
                <div key={idx} className="flex justify-between items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs">
                  <span>{it.descricao} ({it.quantidade} un × R$ {it.precoUnitario.toFixed(2)})</span>
                  <span className="font-bold">R$ {it.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="text-sm font-black text-slate-800 dark:text-slate-200">
                Total: {formatarMoeda(valorTotalNovoPedido)}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsNovoPedidoModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCriarPedidoDireto}
                  disabled={saving || formNovoPedido.itens.length === 0}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  Gerar Espelho e Enviar à Fila
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

