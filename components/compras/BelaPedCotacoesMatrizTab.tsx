import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table,
  Search,
  RefreshCw,
  RotateCcw,
  Download,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingDown,
  TrendingUp,
  Sparkles,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  LineChart,
  Layers,
  Building2,
  Check,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { useToast } from '../ToastContext';

export interface CotacaoPortalItem {
  fornecedor: string;
  preco: number | null;
  disponivel: boolean;
  descricao?: string | null;
  laboratorio?: string | null;
  desc_pct?: number;
  url_produto?: string | null;
  condicao_comercial?: string | null;
  updated_at?: string | null;
}

export interface MatrizProdutoItem {
  produto_id: number;
  descricao: string;
  apresentacao: string;
  ean: string;
  curva_abc: string;
  saldo: number;
  vmd_ponderado: number;
  custo_unitario: number;
  preco_venda_vigente: number;
  preco_ult_compra: number;
  fornecedor_ult_compra: string;
  data_ult_compra: string;
  nf_ult_compra: string;
  cotacoes: { [distribuidora: string]: CotacaoPortalItem };
  menor_preco: number | null;
  melhor_distribuidora: string | null;
  laboratorio_vencedor?: string | null;
  url_vencedor?: string | null;
  variacao_ult_compra_pct: number;
  economia_unitaria: number;
  is_mais_barato: boolean;
  total_disponiveis: number;
  total_cotacoes: number;
  status: 'COM_PRECO' | 'SEM_ESTOQUE' | 'NAO_COTADO';
}

interface MatrizResumo {
  total_exibidos: number;
  total_com_preco: number;
  total_com_economia: number;
  economia_potencial_total: number;
  vitorias_por_distribuidora: { [dist: string]: number };
}

interface Props {
  onVerHistoricoPrecos?: (ean: string, produtoId: number, descricao: string) => void;
  onNavegarTab?: (tab: any) => void;
}

// Lista fixa e padronizada das 9 distribuidoras integradas
const DISTRIBUIDORAS_COLUNAS: { id: string; nome: string; sigla: string }[] = [
  { id: 'PROFARMA', nome: 'PROFARMA', sigla: 'PRO' },
  { id: 'DISTRIMED', nome: 'DISTRIMED', sigla: 'DIS' },
  { id: 'DPC DISTRIBUIDORA', nome: 'DPC', sigla: 'DPC' },
  { id: 'SOTON FARMA', nome: 'SOTON', sigla: 'SOT' },
  { id: 'DIVIMED', nome: 'DIVIMED', sigla: 'DIV' },
  { id: 'MARTINS ATACADO', nome: 'MARTINS', sigla: 'MAR' },
  { id: 'ORIENTE FARMA', nome: 'ORIENTE', sigla: 'ORI' },
  { id: 'PANPHARMA', nome: 'PANPHARMA', sigla: 'PAN' },
  { id: 'MG MEDICAMENTOS', nome: 'MG MEDIC', sigla: 'MGM' }
];

export const BelaPedCotacoesMatrizTab: React.FC<Props> = ({
  onVerHistoricoPrecos,
  onNavegarTab
}) => {
  const { addToast } = useToast();

  // Estados de dados
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [produtos, setProdutos] = useState<MatrizProdutoItem[]>([]);
  const [resumo, setResumo] = useState<MatrizResumo>({
    total_exibidos: 0,
    total_com_preco: 0,
    total_com_economia: 0,
    economia_potencial_total: 0,
    vitorias_por_distribuidora: {}
  });

  // Estados de filtros
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'COM_PRECO' | 'COM_ECONOMIA' | 'SEM_ESTOQUE'>('COM_PRECO');
  const [filtroCurva, setFiltroCurva] = useState<string>('TODAS');
  const [filtroVencedor, setFiltroVencedor] = useState<string>('TODAS');

  // Estado de recotação individual
  const [recotandoEan, setRecotandoEan] = useState<string | null>(null);
  const [recotandoTodos, setRecotandoTodos] = useState(false);

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 50;

  // Carrega dados da matriz do backend
  const carregarMatriz = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (busca.trim()) params.append('busca', busca.trim());
      if (filtroCurva !== 'TODAS') params.append('curva', filtroCurva);
      if (filtroTipo === 'COM_PRECO') params.append('apenas_com_preco', '1');
      if (filtroTipo === 'COM_ECONOMIA') params.append('apenas_com_economia', '1');
      if (filtroVencedor !== 'TODAS') params.append('fornecedor_filtro', filtroVencedor);

      const res = await fetch(`/api/belaped/matriz-cotacoes?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.success) {
        setProdutos(data.produtos || []);
        if (data.resumo) {
          setResumo(data.resumo);
        }
      } else {
        throw new Error(data.error || 'Erro ao carregar matriz');
      }
    } catch (err: any) {
      console.error('[BelaPedMatriz] Erro:', err);
      addToast?.('Erro ao carregar matriz de cotações: ' + err.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [busca, filtroCurva, filtroTipo, filtroVencedor, addToast]);

  useEffect(() => {
    carregarMatriz();
  }, [carregarMatriz]);

  // Recotar um produto do zero
  const handleRecotarItem = async (ean: string, descricao: string) => {
    if (!ean) return;
    setRecotandoEan(ean);
    try {
      const res = await fetch('/api/belaped/recotar-produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ean, descricao })
      });
      const data = await res.json();
      if (data.success) {
        addToast?.(`Cotações antigas de "${descricao}" apagadas! Robôs acionados para recotar do zero.`, 'success');
        // Recarrega matriz após 1.5s
        setTimeout(() => carregarMatriz(true), 1500);
      } else {
        throw new Error(data.error || 'Falha ao recotar');
      }
    } catch (err: any) {
      addToast?.('Erro ao recotar item: ' + err.message, 'error');
    } finally {
      setRecotandoEan(null);
    }
  };

  // Recotar todos do zero
  const handleRecotarTodos = async () => {
    if (!window.confirm('Deseja realmente LIMPAR TODAS as cotações e recotar os produtos do zero em todas as 9 distribuidoras?')) {
      return;
    }
    setRecotandoTodos(true);
    try {
      const res = await fetch('/api/belaped/reiniciar-cotacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        addToast?.('Todas as cotações foram apagadas! Cotação reiniciada do zero em todos os portais.', 'success');
        carregarMatriz(true);
      } else {
        throw new Error(data.error || 'Falha ao reiniciar');
      }
    } catch (err: any) {
      addToast?.('Erro ao reiniciar cotação: ' + err.message, 'error');
    } finally {
      setRecotandoTodos(false);
    }
  };

  // Exportar para CSV
  const exportarCSV = () => {
    if (produtos.length === 0) {
      addToast?.('Nenhum dado para exportar.', 'warning');
      return;
    }

    const headers = [
      'EAN',
      'Descricao',
      'Curva',
      'Saldo',
      'VMD',
      'Ultima_Compra_Preco',
      'Ultima_Compra_Fornecedor',
      ...DISTRIBUIDORAS_COLUNAS.map(d => d.nome.replace(/\s+/g, '_')),
      'Menor_Preco',
      'Melhor_Distribuidora',
      'Variacao_Pct',
      'Economia_Unitaria'
    ];

    const rows = produtos.map(p => {
      const distValues = DISTRIBUIDORAS_COLUNAS.map(d => {
        const cot = p.cotacoes[d.id];
        return cot?.preco ? cot.preco.toFixed(2) : '';
      });

      return [
        `"${p.ean}"`,
        `"${p.descricao.replace(/"/g, '""')}"`,
        p.curva_abc,
        p.saldo,
        p.vmd_ponderado,
        p.preco_ult_compra ? p.preco_ult_compra.toFixed(2) : '',
        `"${(p.fornecedor_ult_compra || '').replace(/"/g, '""')}"`,
        ...distValues,
        p.menor_preco ? p.menor_preco.toFixed(2) : '',
        `"${p.melhor_distribuidora || ''}"`,
        p.variacao_ult_compra_pct ? p.variacao_ult_compra_pct.toFixed(1) : '',
        p.economia_unitaria ? p.economia_unitaria.toFixed(2) : ''
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `BelaPed_Matriz_Cotacoes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast?.('Planilha exportada com sucesso!', 'success');
  };

  // Itens paginados
  const totalPaginas = Math.ceil(produtos.length / itensPorPagina) || 1;
  const produtosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    return produtos.slice(inicio, inicio + itensPorPagina);
  }, [produtos, paginaAtual]);

  // Formatação de moeda BRL
  const formatMoeda = (val: number | null | undefined) => {
    if (val === null || val === undefined || val === 0 || isNaN(val)) return '—';
    return `R$ ${val.toFixed(2).replace('.', ',')}`;
  };

  return (
    <div className="space-y-4">
      {/* ─── TOPO: TÍTULO, STATS E BARRA DE AÇÕES ─────────────────────────── */}
      <div className="bg-[#0b1222]/90 border border-cyan-900/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <Table className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                    Matriz Geral de Cotações & Comparativo
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-950/80 border border-cyan-800 text-cyan-300">
                    9 Portais Conectados
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Compare o último preço de compra do Digifarma com os valores encontrados em tempo real em todas as distribuidoras.
                </p>
              </div>
            </div>
          </div>

          {/* Botões de Ação Global */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => carregarMatriz(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
              title="Atualizar dados da tabela"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>

            <button
              onClick={exportarCSV}
              disabled={produtos.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
              title="Exportar dados para Excel / CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Exportar CSV</span>
            </button>

            <button
              onClick={handleRecotarTodos}
              disabled={recotandoTodos}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 transition-all cursor-pointer disabled:opacity-50 shadow-lg"
              title="Limpar todas as cotações e cotar novamente do zero"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-rose-400 ${recotandoTodos ? 'animate-spin' : ''}`} />
              <span>Recotar Todos do Zero</span>
            </button>
          </div>
        </div>

        {/* ─── CARDS DE INDICADORES (KPIs) ─────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-slate-800/80">
          <div className="bg-[#070b14]/80 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
              Total de Itens
            </span>
            <span className="text-lg font-black text-white mt-0.5 block">
              {resumo.total_exibidos}
            </span>
          </div>

          <div className="bg-[#070b14]/80 p-3 rounded-xl border border-cyan-900/40">
            <span className="text-[10px] font-bold uppercase text-cyan-400 block tracking-wider">
              Cotados com Preço
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-black text-cyan-200">
                {resumo.total_com_preco}
              </span>
              <span className="text-[10px] text-slate-400">
                ({resumo.total_exibidos > 0 ? ((resumo.total_com_preco / resumo.total_exibidos) * 100).toFixed(0) : 0}%)
              </span>
            </div>
          </div>

          <div className="bg-[#070b14]/80 p-3 rounded-xl border border-emerald-900/40">
            <span className="text-[10px] font-bold uppercase text-emerald-400 block tracking-wider">
              Mais Barato que Últ. Compra
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-black text-emerald-300">
                {resumo.total_com_economia}
              </span>
              <span className="text-[10px] text-emerald-500 font-bold">
                oportunidades
              </span>
            </div>
          </div>

          <div className="bg-[#070b14]/80 p-3 rounded-xl border border-amber-900/40">
            <span className="text-[10px] font-bold uppercase text-amber-400 block tracking-wider">
              Economia Estimada (7d)
            </span>
            <span className="text-lg font-black text-amber-300 mt-0.5 block">
              {formatMoeda(resumo.economia_potencial_total)}
            </span>
          </div>
        </div>

        {/* ─── TAGS DE VITÓRIAS POR DISTRIBUIDORA ──────────────────────────── */}
        {Object.keys(resumo.vitorias_por_distribuidora || {}).length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
              Menor Preço Encontrado por Portal:
            </span>
            {DISTRIBUIDORAS_COLUNAS.map(d => {
              const vitorias = resumo.vitorias_por_distribuidora[d.id] || 0;
              const isSelected = filtroVencedor === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => {
                    setFiltroVencedor(isSelected ? 'TODAS' : d.id);
                    setPaginaAtual(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500 text-slate-950 font-black shadow-md'
                      : vitorias > 0
                      ? 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 hover:bg-emerald-900/80'
                      : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                  title={`Filtrar produtos onde ${d.nome} venceu`}
                >
                  <span>{d.nome}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    isSelected ? 'bg-slate-950 text-cyan-300' : 'bg-slate-800 text-slate-200'
                  }`}>
                    {vitorias}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── FILTROS RÁPIDOS E BARRA DE BUSCA ─────────────────────────────── */}
      <div className="bg-[#0b1222]/80 border border-cyan-900/30 rounded-2xl p-3 flex flex-col md:flex-row items-center justify-between gap-3 shadow-md">
        {/* Barra de Busca */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPaginaAtual(1);
            }}
            placeholder="Buscar por descrição ou EAN..."
            className="w-full pl-9 pr-8 py-2 bg-slate-900/90 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
          />
          {busca && (
            <button
              onClick={() => {
                setBusca('');
                setPaginaAtual(1);
              }}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtros em Chips */}
        <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
          <button
            onClick={() => {
              setFiltroTipo('COM_PRECO');
              setPaginaAtual(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filtroTipo === 'COM_PRECO'
                ? 'bg-cyan-500 text-slate-950 font-black shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Com Cotação ({resumo.total_com_preco})
          </button>

          <button
            onClick={() => {
              setFiltroTipo('COM_ECONOMIA');
              setPaginaAtual(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filtroTipo === 'COM_ECONOMIA'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
            }`}
          >
            Mais Barato ({resumo.total_com_economia})
          </button>

          <button
            onClick={() => {
              setFiltroTipo('TODOS');
              setPaginaAtual(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filtroTipo === 'TODOS'
                ? 'bg-cyan-500 text-slate-950 font-black shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Todos os Itens
          </button>

          {/* Seletor de Curva */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl px-2 py-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Curva:</span>
            <select
              value={filtroCurva}
              onChange={(e) => {
                setFiltroCurva(e.target.value);
                setPaginaAtual(1);
              }}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="TODAS" className="bg-slate-900 text-white">Todas</option>
              <option value="A" className="bg-slate-900 text-white">Curva A</option>
              <option value="B" className="bg-slate-900 text-white">Curva B</option>
              <option value="C" className="bg-slate-900 text-white">Curva C</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── TABELA DE ALTA DENSIDADE DA MATRIZ MULTI-DISTRIBUIDORA ─────────── */}
      <div className="bg-[#0b1222]/90 border border-cyan-900/40 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#070b14] border-b border-cyan-900/60">
                {/* 1. Status / Ação */}
                <th className="py-2.5 px-3 text-[11px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap w-12 text-center">
                  #
                </th>

                {/* 2. Produto */}
                <th className="py-2.5 px-3 text-[11px] font-black text-slate-300 uppercase tracking-wider whitespace-nowrap min-w-[260px] max-w-[340px]">
                  Produto & Metadados
                </th>

                {/* 3. Última Compra Digifarma */}
                <th className="py-2.5 px-3 text-[11px] font-black text-slate-300 uppercase tracking-wider whitespace-nowrap text-right min-w-[130px]">
                  Últ. Compra
                </th>

                {/* 4. Colunas das 9 Distribuidoras */}
                {DISTRIBUIDORAS_COLUNAS.map(d => (
                  <th
                    key={d.id}
                    className="py-2.5 px-2 text-[10px] font-black text-slate-300 uppercase tracking-wider whitespace-nowrap text-right min-w-[95px] max-w-[110px]"
                    title={d.nome}
                  >
                    <div className="flex flex-col items-end">
                      <span>{d.nome}</span>
                      <span className="text-[9px] text-slate-400 font-normal">{d.sigla}</span>
                    </div>
                  </th>
                ))}

                {/* 5. Menor Preço Encontrado */}
                <th className="py-2.5 px-3 text-[11px] font-black text-emerald-400 uppercase tracking-wider whitespace-nowrap text-right min-w-[125px]">
                  Menor Preço
                </th>

                {/* 6. Variação vs Última Compra */}
                <th className="py-2.5 px-3 text-[11px] font-black text-cyan-400 uppercase tracking-wider whitespace-nowrap text-right min-w-[120px]">
                  Variação vs ERP
                </th>

                {/* 7. Ações Enxutas por Ícone */}
                <th className="py-2.5 px-2 text-[11px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap text-center w-20">
                  Ação
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                      <p className="font-bold text-slate-300">Carregando matriz de cotações dos 9 portais...</p>
                    </div>
                  </td>
                </tr>
              ) : produtosPaginados.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertTriangle className="w-8 h-8 text-amber-400" />
                      <p className="font-bold text-slate-200">Nenhum produto encontrado com os filtros selecionados.</p>
                      <p className="text-xs text-slate-400">Tente selecionar "Todos os Itens" ou limpar o campo de busca.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                produtosPaginados.map((item, idx) => {
                  const numItem = (paginaAtual - 1) * itensPorPagina + idx + 1;
                  const isRecotandoEste = recotandoEan === item.ean;

                  return (
                    <tr
                      key={item.ean || item.produto_id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* 1. Status / Num */}
                      <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {item.status === 'COM_PRECO' ? (
                          <span title="Cotação disponível">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 inline-block" />
                          </span>
                        ) : item.status === 'SEM_ESTOQUE' ? (
                          <span title="Cotado mas sem estoque nos portais">
                            <AlertTriangle className="w-4 h-4 text-amber-400 inline-block" />
                          </span>
                        ) : (
                          <span title="Aguardando cotação dos robôs">
                            <Clock className="w-4 h-4 text-slate-400 inline-block" />
                          </span>
                        )}
                      </td>

                      {/* 2. Produto (Linha única compacta para metadados conforme regra UX) */}
                      <td className="py-2 px-3 min-w-[260px] max-w-[340px]">
                        <div className="font-bold text-slate-100 text-xs truncate" title={item.descricao}>
                          {item.descricao}
                        </div>
                        {/* Metadados em 1 linha compacta: EAN • Curva • Saldo • VMD */}
                        <div className="inline-flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">
                          <span className="font-mono text-slate-400">{item.ean || 'S/ EAN'}</span>
                          <span>•</span>
                          <span className={`px-1 rounded text-[9px] font-black ${
                            item.curva_abc === 'A'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                              : item.curva_abc === 'B'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            Curva {item.curva_abc}
                          </span>
                          <span>•</span>
                          <span>Saldo: <strong className="text-slate-300">{item.saldo}</strong></span>
                          <span>•</span>
                          <span>VMD: <strong className="text-slate-300">{item.vmd_ponderado}</strong></span>
                        </div>
                      </td>

                      {/* 3. Última Compra Digifarma */}
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className="font-black text-xs text-slate-200">
                          {formatMoeda(item.preco_ult_compra)}
                        </div>
                        <div
                          className="text-[10px] text-slate-400 truncate max-w-[120px] ml-auto"
                          title={`${item.fornecedor_ult_compra} ${item.data_ult_compra ? `(${item.data_ult_compra.slice(0, 10)})` : ''}`}
                        >
                          {item.fornecedor_ult_compra || 'Não registrado'}
                        </div>
                      </td>

                      {/* 4. Colunas das 9 Distribuidoras */}
                      {DISTRIBUIDORAS_COLUNAS.map(dist => {
                        const cot = item.cotacoes[dist.id];
                        const temPreco = cot && cot.preco !== null && cot.preco > 0;
                        const isVencedor = temPreco && item.menor_preco !== null && Math.abs(cot.preco! - item.menor_preco) < 0.005;

                        return (
                          <td
                            key={dist.id}
                            className={`py-2 px-2 text-right whitespace-nowrap ${
                              isVencedor
                                ? 'bg-emerald-950/40 font-black'
                                : ''
                            }`}
                          >
                            {temPreco ? (
                              <div className="flex flex-col items-end">
                                <span className={`text-xs ${
                                  isVencedor
                                    ? 'text-emerald-300 font-black'
                                    : 'text-slate-300 font-semibold'
                                }`}>
                                  {formatMoeda(cot.preco)}
                                </span>
                                {isVencedor && (
                                  <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase text-emerald-400 bg-emerald-950/80 px-1 rounded border border-emerald-500/40">
                                    <Check className="w-2.5 h-2.5" />
                                    <span>Menor</span>
                                  </span>
                                )}
                              </div>
                            ) : cot && !cot.disponivel && cot.updated_at ? (
                              <span
                                className="text-[10px] text-amber-500/80 italic cursor-help"
                                title={cot.descricao || 'Sem estoque no momento nesta distribuidora'}
                              >
                                Sem est.
                              </span>
                            ) : (
                              <span className="text-slate-600 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}

                      {/* 5. Menor Preço Encontrado */}
                      <td className="py-2 px-3 text-right whitespace-nowrap bg-slate-900/40">
                        {item.menor_preco !== null ? (
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-black text-emerald-400">
                              {formatMoeda(item.menor_preco)}
                            </span>
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tight truncate max-w-[110px]" title={item.melhor_distribuidora || ''}>
                              {item.melhor_distribuidora}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs font-medium">Não cotado</span>
                        )}
                      </td>

                      {/* 6. Variação vs Última Compra */}
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {item.menor_preco !== null && item.preco_ult_compra > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className={`inline-flex items-center gap-0.5 text-xs font-black ${
                              item.is_mais_barato
                                ? 'text-emerald-400'
                                : item.variacao_ult_compra_pct > 0
                                ? 'text-rose-400'
                                : 'text-slate-300'
                            }`}>
                              {item.is_mais_barato ? (
                                <TrendingDown className="w-3 h-3 text-emerald-400" />
                              ) : item.variacao_ult_compra_pct > 0 ? (
                                <TrendingUp className="w-3 h-3 text-rose-400" />
                              ) : null}
                              <span>{item.variacao_ult_compra_pct > 0 ? `+${item.variacao_ult_compra_pct}%` : `${item.variacao_ult_compra_pct}%`}</span>
                            </span>
                            {item.is_mais_barato && (
                              <span className="text-[9px] font-bold text-emerald-500">
                                -{formatMoeda(item.economia_unitaria)}/un
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>

                      {/* 7. Ações Enxutas por Ícone (Conforme regra UX do projeto) */}
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleRecotarItem(item.ean, item.descricao)}
                            disabled={isRecotandoEste}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-900/50 text-slate-300 hover:text-cyan-300 border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                            title="Limpar e recotar este produto do zero agora nos 9 portais"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${isRecotandoEste ? 'animate-spin text-cyan-400' : ''}`} />
                          </button>

                          {onVerHistoricoPrecos && (
                            <button
                              onClick={() => onVerHistoricoPrecos(item.ean, item.produto_id, item.descricao)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
                              title="Ver histórico temporal de preços deste produto"
                            >
                              <LineChart className="w-3.5 h-3.5 text-purple-400" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── RODAPÉ DE PAGINAÇÃO ─────────────────────────────────────────── */}
        {!loading && produtos.length > 0 && (
          <div className="p-3 bg-[#070b14] border-t border-cyan-900/40 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
            <div>
              Mostrando <strong className="text-slate-200">{produtosPaginados.length}</strong> de{' '}
              <strong className="text-slate-200">{produtos.length}</strong> produtos
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPaginaAtual(1)}
                disabled={paginaAtual === 1}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                title="Primeira Página"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                disabled={paginaAtual === 1}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                title="Página Anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className="px-3 py-1 bg-slate-900 rounded-lg border border-slate-700 text-slate-200 font-bold">
                {paginaAtual} / {totalPaginas}
              </span>

              <button
                onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual === totalPaginas}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                title="Próxima Página"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPaginaAtual(totalPaginas)}
                disabled={paginaAtual === totalPaginas}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                title="Última Página"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BelaPedCotacoesMatrizTab;
