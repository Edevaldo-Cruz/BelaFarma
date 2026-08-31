import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingDown, 
  DollarSign, 
  RefreshCw, 
  Database, 
  Search, 
  Filter, 
  PlusCircle, 
  CheckSquare, 
  Square, 
  ArrowUpDown,
  Layers,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { EstoqueMinimoProduto, User } from '../../types';
import { useToast } from '../ToastContext';

interface ComprasDashboardProps {
  user: User;
  theme: 'light' | 'dark';
  onNavigateToTab?: (tab: string, preselectedItems?: any[]) => void;
}

export const ComprasDashboard: React.FC<ComprasDashboardProps> = ({
  user,
  theme,
  onNavigateToTab
}) => {
  const { addToast } = useToast();
  const [produtos, setProdutos] = useState<EstoqueMinimoProduto[]>([]);
  const [resumo, setResumo] = useState<{
    totalItens: number;
    totalRuptura: number;
    totalAbaixoMinimo: number;
    totalNormal: number;
    totalExcesso: number;
    valorTotalReposicao: number;
    ultimaAtualizacao: string | null;
    ultimaSincronizacao: string | null;
  }>({
    totalItens: 0,
    totalRuptura: 0,
    totalAbaixoMinimo: 0,
    totalNormal: 0,
    totalExcesso: 0,
    valorTotalReposicao: 0,
    ultimaAtualizacao: null,
    ultimaSincronizacao: null
  });

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  
  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [filtroCurva, setFiltroCurva] = useState<string>('TODAS');
  
  // Seleção
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Modais
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isRecalcModalOpen, setIsRecalcModalOpen] = useState(false);
  const [margemRecalculo, setMargemRecalculo] = useState<number>(15);

  // Paginação
  const [pagina, setPagina] = useState(1);
  const itensPorPagina = 50;

  const carregarDados = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/central-compras/estoque/minimo?limite=500');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.produtos)) {
          setProdutos(data.produtos);
        }
      }

      const resResumo = await fetch('/api/central-compras/estoque/resumo');
      if (resResumo.ok) {
        const dataResumo = await resResumo.json();
        if (dataResumo.success && dataResumo.data) {
          setResumo(dataResumo.data);
        }
      }
    } catch (err: any) {
      addToast('Erro ao carregar dados do estoque: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // Filtragem
  const produtosFiltrados = useMemo(() => {
    return produtos.filter(p => {
      const matchBusca = !busca || 
        p.descricao.toLowerCase().includes(busca.toLowerCase()) || 
        (p.ean && p.ean.includes(busca)) ||
        String(p.produtoId).includes(busca);

      const matchStatus = filtroStatus === 'TODOS' || p.statusRuptura === filtroStatus;
      const matchCurva = filtroCurva === 'TODAS' || p.curvaAbc === filtroCurva;

      return matchBusca && matchStatus && matchCurva;
    });
  }, [produtos, busca, filtroStatus, filtroCurva]);

  // Paginação
  const totalPaginas = Math.max(1, Math.ceil(produtosFiltrados.length / itensPorPagina));
  const produtosPaginados = useMemo(() => {
    const start = (pagina - 1) * itensPorPagina;
    return produtosFiltrados.slice(start, start + itensPorPagina);
  }, [produtosFiltrados, pagina]);

  const toggleSelectAll = () => {
    if (selectedIds.size === produtosPaginados.length && produtosPaginados.length > 0) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<number>();
      produtosPaginados.forEach(p => next.add(p.produtoId));
      setSelectedIds(next);
    }
  };

  const toggleSelectOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Sincronização com Firebird (Digifarma)
  const executarSyncDigifarma = async () => {
    try {
      setSyncing(true);
      const itensParaSync = selectedIds.size > 0 
        ? produtos.filter(p => selectedIds.has(p.produtoId)).map(p => ({
            produtoId: p.produtoId,
            estoqueMinimo: p.estMinimoCalculado
          }))
        : produtos.map(p => ({
            produtoId: p.produtoId,
            estoqueMinimo: p.estMinimoCalculado
          }));

      if (itensParaSync.length === 0) {
        addToast('Nenhum item para sincronizar no Firebird.', 'warning');
        return;
      }

      const res = await fetch('/api/central-compras/estoque/sync-digifarma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensParaSync })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`✅ Sincronização atômica concluída no Firebird! (${data.rowsAffected || itensParaSync.length} produtos atualizados)`, 'success');
        setIsSyncModalOpen(false);
        carregarDados();
      } else {
        addToast('Erro na sincronização: ' + (data.error || 'Falha na transação Firebird'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação com o servidor: ' + err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Recalcular Demanda e Estoque Mínimo
  const executarRecalculo = async () => {
    try {
      setRecalculating(true);
      const res = await fetch('/api/central-compras/estoque/recalcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ margemPercent: margemRecalculo })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`✅ Recálculo ponderado para 30 dias finalizado! (${data.recalculados || 0} produtos processados com margem +${margemRecalculo}%)`, 'success');
        setIsRecalcModalOpen(false);
        carregarDados();
      } else {
        addToast('Erro ao recalcular estoque mínimo: ' + (data.error || 'Erro desconhecido'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setRecalculating(false);
    }
  };

  const handleEnviarParaCotacao = () => {
    const itensSelecionados = produtos.filter(p => selectedIds.has(p.produtoId));
    if (itensSelecionados.length === 0) {
      addToast('Selecione ao menos um produto na tabela para cotar.', 'warning');
      return;
    }

    if (onNavigateToTab) {
      onNavigateToTab('cotacoes', itensSelecionados.map(p => ({
        produtoId: p.produtoId,
        descricao: p.descricao,
        ean: p.ean,
        quantidade: Math.max(1, p.sugeridoReposicao || p.estMinimoCalculado),
        precoUnitarioEstimado: p.custoUnitario || p.ultimaCompraValor || 0
      })));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ruptura Crítica */}
        <div 
          onClick={() => { setFiltroStatus('RUPTURA'); setPagina(1); }}
          className={`p-5 rounded-2xl border transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
            filtroStatus === 'RUPTURA' 
              ? 'ring-2 ring-red-500 bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <Package className="w-4 h-4 animate-pulse" />
              Ruptura Crítica (Estoque 0)
            </span>
            <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300">
              Ação Imediata
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {resumo.totalRuptura}
            </span>
            <span className="text-xs font-bold text-slate-400">
              produtos
            </span>
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Itens com demanda ativa sem nenhum estoque físico
          </p>
        </div>

        {/* Abaixo do Mínimo */}
        <div 
          onClick={() => { setFiltroStatus('ABAIXO_MINIMO'); setPagina(1); }}
          className={`p-5 rounded-2xl border transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
            filtroStatus === 'ABAIXO_MINIMO' 
              ? 'ring-2 ring-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Abaixo do Mínimo (30d)
            </span>
            <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
              Risco Médio
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {resumo.totalAbaixoMinimo}
            </span>
            <span className="text-xs font-bold text-slate-400">
              produtos
            </span>
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Estoque cobre menos de 30 dias de CMV ponderado
          </p>
        </div>

        {/* Valor Estimado de Reposição */}
        <div className="p-5 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4" />
              Investimento Reposição
            </span>
            <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
              Estoque 30d
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 dark:text-white">
              R$ {resumo.valorTotalReposicao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Custo total para zerar rupturas e atingir 30 dias
          </p>
        </div>

        {/* Status do Sync Digifarma (Firebird) */}
        <div className="p-5 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <Database className="w-4 h-4" />
              Digifarma ERP Sync
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-black rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
              PROD_ESTMINIMO
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div className="flex flex-col">
              <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                {resumo.totalItens} monitorados
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                Transações ACID Atômicas
              </span>
            </div>
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
            {resumo.ultimaSincronizacao ? `Último sync: ${new Date(resumo.ultimaSincronizacao).toLocaleTimeString('pt-BR')}` : 'Pronto para sincronizar'}
          </p>
        </div>
      </div>

      {/* Toolbar de Ações & Filtros */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Busca */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
              placeholder="Buscar por nome do medicamento, EAN ou código..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
            />
          </div>

          {/* Botões de Ação Principal */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsRecalcModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-wider transition-all"
            >
              <Zap className="w-4 h-4 text-amber-500" />
              Recalcular Demanda
            </button>

            <button
              onClick={() => setIsSyncModalOpen(true)}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              Gravar no Digifarma ({selectedIds.size > 0 ? selectedIds.size : 'Todos'})
            </button>

            {selectedIds.size > 0 && (
              <button
                onClick={handleEnviarParaCotacao}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all animate-in fade-in"
              >
                <PlusCircle className="w-4 h-4" />
                Cotar Selecionados ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Filtros em Abas/Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              Status:
            </span>
            {[
              { id: 'TODOS', label: 'Todos' },
              { id: 'RUPTURA', label: 'Ruptura (0)' },
              { id: 'ABAIXO_MINIMO', label: 'Abaixo do Mínimo' },
              { id: 'NORMAL', label: 'Normal' },
              { id: 'EXCESSO', label: 'Excesso' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setFiltroStatus(tab.id); setPagina(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroStatus === tab.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              Curva:
            </span>
            {['TODAS', 'A', 'B', 'C'].map(c => (
              <button
                key={c}
                onClick={() => { setFiltroCurva(c); setPagina(1); }}
                className={`w-7 h-7 rounded-lg text-xs font-black transition-all ${
                  filtroCurva === c
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {c === 'TODAS' ? '*' : c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela Interativa de Estoque */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 w-10">
                  <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    {selectedIds.size > 0 && selectedIds.size === produtosPaginados.length ? (
                      <CheckSquare className="w-4 h-4 text-red-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4">Código / EAN</th>
                <th className="py-3 px-4">Medicamento / Apresentação</th>
                <th className="py-3 px-3 text-center">Curva</th>
                <th className="py-3 px-3 text-right">VMD (60d)</th>
                <th className="py-3 px-3 text-right">Demanda 30d</th>
                <th className="py-3 px-3 text-right">Saldo Atual</th>
                <th className="py-3 px-3 text-right">Est. Mínimo</th>
                <th className="py-3 px-3 text-right text-sky-600 dark:text-sky-400">Pedido Mínimo</th>
                <th className="py-3 px-3 text-right text-purple-600 dark:text-purple-400">Est. Máximo (+20%)</th>
                <th className="py-3 px-4 text-center">Status Risco</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs font-medium">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 font-bold">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-600" />
                    Carregando inteligência de estoque para 30 dias...
                  </td>
                </tr>
              ) : produtosPaginados.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <Info className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    Nenhum medicamento encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                produtosPaginados.map(item => {
                  const isSelected = selectedIds.has(item.produtoId);
                  const estMin = item.estMinimoCalculado || 0;
                  const estMax = item.estMaximoCalculado || Math.ceil(estMin * 1.2);
                  const pedidoMin = item.pedidoMinimo !== undefined ? item.pedidoMinimo : (item.sugeridoReposicao || Math.max(0, estMin - item.saldo));

                  const isAbaixoMinimo = estMin > 0 && item.saldo < estMin;
                  const isAcimaMaximo = estMax > 0 && item.saldo > estMax;
                  
                  let badgeColor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                  let statusTexto = 'Ideal';

                  if (item.statusRuptura === 'RUPTURA' || item.saldo <= 0) {
                    badgeColor = 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-300 dark:border-sky-800 font-black animate-pulse';
                    statusTexto = 'Ruptura (0)';
                  } else if (isAbaixoMinimo) {
                    badgeColor = 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-black';
                    statusTexto = 'Abaixo Mínimo';
                  } else if (isAcimaMaximo) {
                    badgeColor = 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800 font-black';
                    statusTexto = 'Acima Máximo';
                  } else {
                    badgeColor = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold';
                    statusTexto = 'Ideal';
                  }

                  let saldoStyle = 'text-slate-900 dark:text-slate-100';
                  if (isAbaixoMinimo) saldoStyle = 'text-sky-600 dark:text-sky-400 font-black';
                  if (isAcimaMaximo) saldoStyle = 'text-red-600 dark:text-red-400 font-black';

                  return (
                    <tr 
                      key={item.produtoId}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-red-50/50 dark:bg-red-950/20' : isAbaixoMinimo ? 'bg-sky-50/20 dark:bg-sky-950/10' : isAcimaMaximo ? 'bg-red-50/20 dark:bg-red-950/10' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <button onClick={() => toggleSelectOne(item.produtoId)}>
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-red-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="font-bold text-slate-800 dark:text-slate-200">#{item.produtoId}</div>
                        {item.ean && <div>{item.ean}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-black text-slate-900 dark:text-slate-100 max-w-xs truncate" title={item.descricao}>
                          {item.descricao}
                        </div>
                        {item.apresentacao && (
                          <div className="text-[10px] text-slate-400 truncate">{item.apresentacao}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          item.curvaAbc === 'A' ? 'bg-red-600 text-white' :
                          item.curvaAbc === 'B' ? 'bg-amber-500 text-white' :
                          'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}>
                          {item.curvaAbc || 'C'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {item.vmdPonderado?.toFixed(2) || '0.00'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-700 dark:text-slate-200">
                        {item.demanda30d || 0} un
                      </td>
                      <td className={`py-3 px-3 text-right font-mono font-black ${saldoStyle}`}>
                        {item.saldo}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-700 dark:text-slate-300">
                        {estMin} un
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black">
                        {pedidoMin > 0 ? (
                          <span className="px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 font-black">
                            +{pedidoMin}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">0</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-purple-700 dark:text-purple-300">
                        {estMax} un
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] ${badgeColor}`}>
                          {statusTexto}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Mostrando página <b>{pagina}</b> de <b>{totalPaginas}</b> ({produtosFiltrados.length} produtos)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Confirmar Sincronização Firebird */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 rounded-2xl">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  Gravação no Firebird Digifarma
                </h3>
                <p className="text-xs font-bold text-slate-400">
                  Atualização transacional atômica no campo PROD_ESTMINIMO
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Itens selecionados para gravação:</span>
                <span className="font-black text-slate-800 dark:text-slate-200">
                  {selectedIds.size > 0 ? `${selectedIds.size} itens marcados` : `Todos os ${produtos.length} produtos`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Transação de Banco:</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">READ COMMITTED + Rollback</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Tabela / Campo Destino:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">PRODUTOS.PROD_ESTMINIMO</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsSyncModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={executarSyncDigifarma}
                disabled={syncing}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirmar Gravação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Recalcular Demanda */}
      {isRecalcModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 rounded-2xl">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  Recalcular Demanda Ponderada
                </h3>
                <p className="text-xs font-bold text-slate-400">
                  Fórmula: VMD ponderado (0.65 e 0.35) × 30 dias + Margem
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300">
                Margem de Segurança Adicional (%)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={margemRecalculo}
                  onChange={(e) => setMargemRecalculo(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-24 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black text-center text-slate-900 dark:text-white"
                />
                <span className="text-xs text-slate-500 font-medium">
                  Padrão do sistema: +15% para cobertura de oscilações
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                onClick={() => setIsRecalcModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={executarRecalculo}
                disabled={recalculating}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {recalculating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Recalcular Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
