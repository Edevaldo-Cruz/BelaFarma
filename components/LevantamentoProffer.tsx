import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Scale,
  RefreshCw,
  Search,
  Check,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Upload,
  FileSpreadsheet,
  Download,
  Pencil,
  RotateCcw,
  EyeOff,
  Plus,
  Bot,
  Square,
  ShieldCheck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Wifi,
  WifiOff,
  FilterX,
  Database,
  Layers,
  Play,
  ArrowRight
} from 'lucide-react';
import { useToast } from './ToastContext';
import { roundUpToAcceptedCents } from '../utils';
import { User } from '../types';

interface LevantamentoProfferProps {
  user?: User | null;
}

interface SessaoLevantamento {
  id: string;
  titulo: string;
  status: 'aberto' | 'concluido';
  criterio_escopo: string;
  total_itens: number;
  total_conferidos: number;
  total_ajustados: number;
  total_com_proffer: number;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
}

interface ResumoLevantamento {
  totalItens: number;
  toleranciaPct: number;
  apenasFaixaReal: boolean;
  saldoPositivo: number;
  saldoNegativo: number;
  zeradosComMov: number;
  comMovimentacao: number;
  comProffer: number;
  semProffer: number;
  comFaixaRealIndependentes: number;
  coberturaProfferPct: number;
  profferUltimaAtualizacao: string | null;
  abaixoMinimoProffer: number;
  abaixoMediaProffer: number;
  naMediaProffer: number;
  acimaMediaProffer: number;
  acimaMaximoProffer: number;
  ondeAumentar: number;
  ondeDiminuir: number;
  naMediaIndependentes: number;
  foraDaMediaTotal: number;
  potencialAumentoMensal: number;
  excessoMedioPctPesados: number;
  abaixoCusto: number;
  potencialGanhoMensal: number;
  curvas: { A: number; B: number; C: number };
  conferencia: {
    pendente: number;
    conferido: number;
    ajustado: number;
    ignorado: number;
    progressoPct: number;
  };
}

interface ItemLevantamento {
  produto_id: number;
  ean: string;
  descricao: string;
  categoria_id: number;
  categoria_class: string;
  curva_abc: 'A' | 'B' | 'C' | string;
  saldo: number;
  vendas_30d: number;
  vendas_31_60d: number;
  vendas_61_90d: number;
  vendas_10m: number;
  entradas_10m: number;
  vmd_ponderado: number;
  ciclo_vida: string;
  status_ruptura: string;
  custo_efetivo: number;
  preco_loja: number;
  preco_normal: number;
  preco_promocional: number;
  margem_atual_pct: number;
  abaixo_custo: boolean;
  proffer_baixo: number | null;
  proffer_medio: number | null;
  proffer_alto: number | null;
  proffer_rede_medio: number | null;
  proffer_grupo?: string | null;
  proffer_fonte: string | null;
  proffer_atualizado_em: string | null;
  tem_faixa_real: boolean;
  diff_proffer_valor: number | null;
  diff_proffer_pct: number | null;
  posicao_proffer: string;
  acao_recomendada?: 'AUMENTAR' | 'DIMINUIR' | 'MANTER' | 'SEM_PROFFER' | string;
  preco_sugerido_media: number | null;
  preco_sugerido_menos_5?: number | null;
  preco_sugerido_proffer_menos_10: number | null;
  preco_sugerido_baixo?: number | null;
  preco_sugerido_alto?: number | null;
  preco_sugerido_markup: number | null;
  ganho_mensal_estimado: number;
  ultima_compra_data: string | null;
  ultima_compra_fornecedor: string | null;
  status_conferencia: 'pendente' | 'conferido' | 'ajustado' | 'ignorado';
  preco_antes_levantamento: number;
  preco_aplicado: number | null;
  observacao: string;
  conferido_por: string | null;
  conferido_em: string | null;
}

interface ProfferHealthState {
  nappAuthOk: boolean;
  catalogTotal?: number;
  profferServiceStatus?: string;
  profferApiOk: boolean;
  httpStatus?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  testedAt?: string;
  sampleProduct?: { id: string; ean: string; name: string } | null;
  samplePrices?: { baixo: number; medio: number; alto: number } | null;
}

interface ScrapeStatus {
  running: boolean;
  totalItems: number;
  currentProgress: number;
  successCount: number;
  failedCount: number;
  skippedNoProffer?: number;
  abortedByHealthcheck?: boolean;
  targetScope?: string;
  lastError: string | null;
}

type SortKey =
  | 'descricao'
  | 'saldo'
  | 'vendas30d'
  | 'custo'
  | 'preco'
  | 'proffer'
  | 'desvio'
  | 'desvio_abs'
  | 'status';

type AcaoTab = 'FORA_DA_MEDIA' | 'AUMENTAR' | 'DIMINUIR' | 'NA_MEDIA' | 'ALL';

const TOLERANCIA_OPCOES = [3, 5, 8, 10, 15, 20];

const RECORTES = [
  { id: 'TODOS', label: 'Todos Ativos/Mov.' },
  { id: 'SALDO_POSITIVO', label: 'Saldo Positivo (>0)' },
  { id: 'SALDO_NEGATIVO', label: 'Saldo Negativo (<0)' },
  { id: 'SALDO_NAO_ZERO', label: 'Saldo ≠ 0' },
  { id: 'ZERADO_COM_MOV', label: 'Zerados c/ Mov.' },
  { id: 'COM_MOVIMENTACAO', label: 'Com Movimentação' },
  { id: 'GIRO_ALTA', label: 'Giro em Alta' },
  { id: 'GIRO_QUEDA', label: 'Giro em Queda' }
];

const formatMoney = (val: number | null | undefined) => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

const formatDateShort = (raw: string | null | undefined) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('pt-BR');
};

function detectarColuna(headers: string[], aliases: string[]): string {
  const norm = headers.map(h => ({
    raw: h,
    clean: h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  }));
  for (const alias of aliases) {
    const exact = norm.find(n => n.clean === alias);
    if (exact) return exact.raw;
  }
  for (const alias of aliases) {
    const partial = norm.find(n => n.clean.includes(alias));
    if (partial) return partial.raw;
  }
  return '';
}

export const LevantamentoProffer: React.FC<LevantamentoProfferProps> = ({ user }) => {
  const { addToast } = useToast();

  // Sessões
  const [sessoes, setSessoes] = useState<SessaoLevantamento[]>([]);
  const [sessaoId, setSessaoId] = useState<string>('');
  const [resumo, setResumo] = useState<ResumoLevantamento | null>(null);

  // Saúde Proffer e Scraper
  const [health, setHealth] = useState<ProfferHealthState | null>(null);
  const [localBaseInfo, setLocalBaseInfo] = useState<{ total: number; comFaixaReal: number; ultimaAtualizacao: string | null } | null>(null);
  const [testingHealth, setTestingHealth] = useState(false);
  const [coletaEscopo, setColetaEscopo] = useState<'sem_proffer' | 'levantamento'>('sem_proffer');
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>({
    running: false,
    totalItems: 0,
    currentProgress: 0,
    successCount: 0,
    failedCount: 0,
    lastError: null
  });

  // Filtros e paginação
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [acaoFilter, setAcaoFilter] = useState<AcaoTab>('FORA_DA_MEDIA');
  const [toleranciaPct, setToleranciaPct] = useState<number>(5);
  const [apenasFaixaReal, setApenasFaixaReal] = useState<boolean>(true);
  const [recorte, setRecorte] = useState('TODOS');
  const [curva, setCurva] = useState('ALL');
  const [profferStatus, setProfferStatus] = useState('ALL');
  const [desvioMinPct, setDesvioMinPct] = useState('0');
  const [margemFilter, setMargemFilter] = useState('ALL');
  const [categoria, setCategoria] = useState('ALL');
  const [statusConferencia, setStatusConferencia] = useState('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('desvio_abs');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [sortAnnouncement, setSortAnnouncement] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Tabela e seleção
  const [items, setItems] = useState<ItemLevantamento[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncingDigifarma, setSyncingDigifarma] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modal 1 — Revisão Manual Sequencial (1 por 1)
  const individualDialogRef = useRef<HTMLDialogElement>(null);
  const modalChangedRef = useRef(false);
  const submitNextRef = useRef(false);
  const [editingItem, setEditingItem] = useState<ItemLevantamento | null>(null);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [novoPrecoInput, setNovoPrecoInput] = useState('');
  const [arredondarComercial, setArredondarComercial] = useState(true);
  const [motivoInput, setMotivoInput] = useState('');
  const [applyingSingle, setApplyingSingle] = useState(false);

  // Modal 2 — Reajuste em Lote
  const batchDialogRef = useRef<HTMLDialogElement>(null);
  const [batchStrategy, setBatchStrategy] = useState<'proffer_medio' | 'proffer_menos_10' | 'proffer_baixo' | 'markup_loja'>('proffer_medio');
  const [respeitarPisoCusto, setRespeitarPisoCusto] = useState(true);
  const [applyingBatch, setApplyingBatch] = useState(false);

  // Modal 3 — Importar Planilha Proffer
  const importDialogRef = useRef<HTMLDialogElement>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRawRows, setImportRawRows] = useState<Record<string, any>[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [colEan, setColEan] = useState('');
  const [colBaixo, setColBaixo] = useState('');
  const [colMedio, setColMedio] = useState('');
  const [colAlto, setColAlto] = useState('');
  const [importingProffer, setImportingProffer] = useState(false);

  // Modal 4 — Novo Levantamento
  const newSessionDialogRef = useRef<HTMLDialogElement>(null);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionScope, setNewSessionScope] = useState('ativos_movimentacao');
  const [creatingSession, setCreatingSession] = useState(false);

  // Debounce da busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Carregar sessões
  const fetchSessoes = useCallback(async () => {
    try {
      const res = await fetch('/api/levantamento-proffer/sessoes');
      if (!res.ok) throw new Error('Falha ao carregar sessões de levantamento.');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSessoes(json.data);
        setSessaoId(prev => prev || (json.data[0]?.id || ''));
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao carregar sessões.', 'error');
    }
  }, [addToast]);

  // Carregar resumo KPI
  const fetchResumo = useCallback(async (targetSessaoId?: string) => {
    const sid = targetSessaoId || sessaoId;
    if (!sid) return;
    try {
      const qs = new URLSearchParams({
        sessaoId: sid,
        toleranciaPct: String(toleranciaPct),
        apenasFaixaReal: String(apenasFaixaReal)
      });
      const res = await fetch(`/api/levantamento-proffer/resumo?${qs.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setResumo(json.data);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar resumo do levantamento:', err);
    }
  }, [sessaoId, toleranciaPct, apenasFaixaReal]);

  // Carregar produtos paginados
  const fetchProdutos = useCallback(async () => {
    if (!sessaoId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sessaoId,
        page: String(page),
        limit: String(limit),
        search,
        acaoFilter,
        toleranciaPct: String(toleranciaPct),
        apenasFaixaReal: String(apenasFaixaReal),
        recorte,
        curva,
        profferStatus,
        desvioMinPct,
        margemFilter,
        categoria,
        statusConferencia,
        sortBy,
        sortDir
      });
      const res = await fetch(`/api/levantamento-proffer/produtos?${params.toString()}`);
      if (!res.ok) throw new Error('Falha ao carregar lista de produtos.');
      const json = await res.json();
      if (json.success) {
        setItems(json.data || []);
        setTotalItems(json.pagination?.totalItems || 0);
        setTotalPages(json.pagination?.totalPages || 1);
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao buscar produtos.', 'error');
    } finally {
      setLoading(false);
    }
  }, [sessaoId, page, limit, search, acaoFilter, toleranciaPct, apenasFaixaReal, recorte, curva, profferStatus, desvioMinPct, margemFilter, categoria, statusConferencia, sortBy, sortDir, addToast]);

  // Testar conexão Proffer
  const handleTestHealth = useCallback(async (silent = false) => {
    setTestingHealth(true);
    try {
      const res = await fetch('/api/levantamento-proffer/proffer-health');
      const json = await res.json();
      if (json.success) {
        setHealth(json.health);
        setLocalBaseInfo(json.localBase);
        if (!silent) {
          if (json.health?.profferApiOk) {
            addToast('Proffer respondeu 200 OK! Coleta ao vivo liberada.', 'success');
          } else {
            addToast(`Proffer indisponível no momento (${json.health?.errorMessage || 'erro remoto'}). Base local preservada.`, 'warning');
          }
        }
      }
    } catch (err: any) {
      if (!silent) addToast(err.message || 'Erro ao testar Proffer.', 'error');
    } finally {
      setTestingHealth(false);
    }
  }, [addToast]);

  const fetchScrapeStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/levantamento-proffer/coleta-status');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.status) {
          setScrapeStatus(json.status);
        }
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchSessoes();
    fetchScrapeStatus();
    handleTestHealth(true);
  }, [fetchSessoes, fetchScrapeStatus, handleTestHealth]);

  useEffect(() => {
    if (sessaoId) {
      fetchResumo(sessaoId);
      fetchProdutos();
      setSelectedIds([]);
    }
  }, [sessaoId, fetchResumo, fetchProdutos]);

  useEffect(() => {
    if (!scrapeStatus.running) return;
    const interval = setInterval(() => {
      fetchScrapeStatus();
      fetchResumo();
      fetchProdutos();
    }, 3000);
    return () => clearInterval(interval);
  }, [scrapeStatus.running, fetchScrapeStatus, fetchResumo, fetchProdutos]);

  const handleSort = (col: SortKey, label: string) => {
    const nextDir: 'asc' | 'desc' = sortBy === col && sortDir === 'asc' ? 'desc' : 'asc';
    setSortBy(col);
    setSortDir(nextDir);
    setPage(1);
    setSortAnnouncement(`Ordenado por ${label}, ${nextDir === 'asc' ? 'crescente' : 'decrescente'}`);
  };

  const selectActionTab = (tab: AcaoTab) => {
    setAcaoFilter(tab);
    setProfferStatus('ALL');
    if (tab === 'AUMENTAR') {
      setSortBy('desvio');
      setSortDir('asc');
    } else if (tab === 'DIMINUIR') {
      setSortBy('desvio');
      setSortDir('desc');
    } else {
      setSortBy('desvio_abs');
      setSortDir('desc');
    }
    setPage(1);
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setAcaoFilter('FORA_DA_MEDIA');
    setToleranciaPct(5);
    setApenasFaixaReal(true);
    setRecorte('TODOS');
    setCurva('ALL');
    setProfferStatus('ALL');
    setDesvioMinPct('0');
    setMargemFilter('ALL');
    setCategoria('ALL');
    setStatusConferencia('ALL');
    setSortBy('desvio_abs');
    setSortDir('desc');
    setPage(1);
  };

  const handleSyncDigifarma = async () => {
    if (!sessaoId || syncingDigifarma) return;
    setSyncingDigifarma(true);
    try {
      const res = await fetch(`/api/levantamento-proffer/sessoes/${encodeURIComponent(sessaoId)}/sincronizar-digifarma`, {
        method: 'POST'
      });
      const json = await res.json();
      if (json.success) {
        addToast(json.message, json.fromCacheFallback ? 'info' : 'success');
        await fetchSessoes();
        await fetchResumo();
        await fetchProdutos();
      } else {
        throw new Error(json.error || 'Erro ao sincronizar Digifarma.');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao sincronizar Digifarma.', 'error');
    } finally {
      setSyncingDigifarma(false);
    }
  };

  const handleDispararColeta = async () => {
    try {
      const res = await fetch('/api/levantamento-proffer/disparar-coleta-proffer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessaoId, escopo: coletaEscopo })
      });
      const json = await res.json();
      if (json.profferOffline) {
        setHealth(json.health);
        addToast(json.error || 'Proffer indisponível no momento. Coleta não iniciada.', 'warning');
        return;
      }
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao iniciar coleta Proffer.');
      }
      addToast(json.message, json.nothingToCollect ? 'info' : 'success');
      fetchScrapeStatus();
    } catch (err: any) {
      addToast(err.message || 'Erro ao disparar coleta.', 'error');
    }
  };

  const handlePararColeta = async () => {
    try {
      await fetch('/api/levantamento-proffer/parar-coleta-proffer', { method: 'POST' });
      addToast('Solicitada interrupção da coleta Proffer.', 'info');
      fetchScrapeStatus();
    } catch (err: any) {
      addToast('Erro ao interromper coleta.', 'error');
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (!sessaoId || exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({
        sessaoId,
        search,
        acaoFilter,
        toleranciaPct: String(toleranciaPct),
        apenasFaixaReal: String(apenasFaixaReal),
        recorte,
        curva,
        profferStatus,
        desvioMinPct,
        margemFilter,
        categoria,
        statusConferencia,
        sortBy,
        sortDir,
        format: format === 'csv' ? 'csv' : 'json'
      });

      if (format === 'csv') {
        const res = await fetch(`/api/levantamento-proffer/exportar?${params.toString()}`);
        if (!res.ok) throw new Error('Falha ao exportar CSV.');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `levantamento_proffer_${recorte.toLowerCase()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        addToast('CSV exportado com sucesso!', 'success');
      } else {
        const res = await fetch(`/api/levantamento-proffer/exportar?${params.toString()}`);
        const json = await res.json();
        if (!json.success || !Array.isArray(json.data)) {
          throw new Error(json.error || 'Falha ao exportar Excel.');
        }
        const rowsForSheet = json.data.map((it: ItemLevantamento) => ({
          Codigo: it.produto_id,
          EAN: it.ean,
          Produto: it.descricao,
          Categoria: it.categoria_class,
          Curva: it.curva_abc,
          Saldo: it.saldo,
          Vendas_30d: it.vendas_30d,
          Vendas_10m: it.vendas_10m,
          Entradas_10m: it.entradas_10m,
          Ciclo_Vida: it.ciclo_vida,
          Custo_R$: it.custo_efetivo,
          Preco_Loja_R$: it.preco_loja,
          Margem_Pct: it.margem_atual_pct,
          Proffer_Baixo_R$: it.proffer_baixo ?? '',
          Proffer_Medio_R$: it.proffer_medio ?? '',
          Proffer_Alto_R$: it.proffer_alto ?? '',
          Desvio_R$: it.diff_proffer_valor ?? '',
          Desvio_Pct: it.diff_proffer_pct ?? '',
          Posicao_Proffer: it.posicao_proffer,
          Acao_Recomendada: it.acao_recomendada || '',
          Grupo_Proffer: it.proffer_grupo || 'INDEPENDENTE',
          Sugestao_Media_Indep_R$: it.preco_sugerido_media ?? '',
          Sugestao_Media_Menos5_R$: it.preco_sugerido_menos_5 ?? '',
          Sugestao_Proffer_Menos10_R$: it.preco_sugerido_proffer_menos_10 ?? '',
          Ganho_Mensal_Est_R$: it.ganho_mensal_estimado,
          Status_Levantamento: it.status_conferencia,
          Proffer_Atualizado_Em: it.proffer_atualizado_em || ''
        }));
        const ws = XLSX.utils.json_to_sheet(rowsForSheet);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Levantamento Proffer');
        XLSX.writeFile(wb, `levantamento_proffer_${recorte.toLowerCase()}.xlsx`);
        addToast(`Planilha Excel gerada (${rowsForSheet.length} itens)!`, 'success');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao exportar levantamento.', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Ações de conferência individual e lote
  const handleItemStatus = async (produtoId: number, statusConferencia: 'pendente' | 'conferido' | 'ignorado') => {
    try {
      const res = await fetch(`/api/levantamento-proffer/itens/${produtoId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessaoId,
          statusConferencia,
          usuario: user?.name || 'Administrador'
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Erro ao atualizar status.');
      setItems(prev => prev.map(it => it.produto_id === produtoId ? { ...it, status_conferencia: statusConferencia } : it));
      fetchResumo();
    } catch (err: any) {
      addToast(err.message || 'Erro ao atualizar status.', 'error');
    }
  };

  const handleBatchStatus = async (statusConferencia: 'conferido' | 'ignorado' | 'pendente') => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch('/api/levantamento-proffer/itens/status-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessaoId,
          produtoIds: selectedIds,
          statusConferencia,
          usuario: user?.name || 'Administrador'
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Erro no lote.');
      addToast(`${json.updatedCount} itens marcados como "${statusConferencia}".`, 'success');
      setSelectedIds([]);
      fetchProdutos();
      fetchResumo();
    } catch (err: any) {
      addToast(err.message || 'Erro ao atualizar em lote.', 'error');
    }
  };

  // Modal 1: Revisão Manual Sequencial (1 por 1)
  const loadItemIntoEditor = (item: ItemLevantamento, index: number) => {
    setEditingItem(item);
    setEditingIndex(index);
    const initialTarget =
      item.preco_sugerido_media ||
      (item.proffer_medio && item.proffer_medio > 0 ? item.proffer_medio : item.preco_loja) ||
      0;
    setNovoPrecoInput(initialTarget > 0 ? initialTarget.toFixed(2) : '');
    setMotivoInput(
      item.proffer_medio
        ? `Alinhamento Média Indep. Proffer (R$ ${item.proffer_medio.toFixed(2)})`
        : 'Ajuste manual via Levantamento Proffer'
    );
  };

  const openEditDialog = (item: ItemLevantamento, index?: number) => {
    const resolvedIndex = typeof index === 'number' && index >= 0
      ? index
      : items.findIndex(it => it.produto_id === item.produto_id);
    modalChangedRef.current = false;
    loadItemIntoEditor(item, resolvedIndex >= 0 ? resolvedIndex : 0);
    individualDialogRef.current?.showModal();
  };

  const openSequentialQueue = () => {
    if (items.length === 0) {
      addToast('Nenhum produto na listagem atual para revisar.', 'info');
      return;
    }
    const firstPendingIdx = items.findIndex(it => it.status_conferencia === 'pendente');
    const targetIdx = firstPendingIdx >= 0 ? firstPendingIdx : 0;
    openEditDialog(items[targetIdx], targetIdx);
  };

  const navigateQueue = (direction: -1 | 1) => {
    const nextIdx = editingIndex + direction;
    if (nextIdx >= 0 && nextIdx < items.length) {
      loadItemIntoEditor(items[nextIdx], nextIdx);
    }
  };

  const adjustNovoPreco = (mode: 'pct' | 'abs', delta: number) => {
    const parsed = parseFloat(novoPrecoInput.replace(',', '.'));
    const base = !isNaN(parsed) && parsed > 0 ? parsed : (editingItem?.preco_loja || 0);
    if (base <= 0) return;
    const nextVal = mode === 'pct' ? base * (1 + delta / 100) : base + delta;
    const clamped = Math.max(0.05, nextVal);
    setNovoPrecoInput(clamped.toFixed(2));
  };

  const singlePreview = useMemo(() => {
    if (!editingItem) {
      return {
        raw: 0,
        finalPrice: 0,
        marginPct: 0,
        belowCost: false,
        diffPct: 0,
        diffVal: 0,
        diffProfferPct: null as number | null,
        projectedAction: 'SEM_PROFFER' as string,
        impactoMensal: 0
      };
    }
    const parsed = parseFloat(novoPrecoInput.replace(',', '.'));
    const raw = !isNaN(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0;
    const finalPrice = raw > 0 ? (arredondarComercial ? roundUpToAcceptedCents(raw) : raw) : 0;
    const cost = editingItem.custo_efetivo;
    const marginPct = finalPrice > 0 && cost > 0 ? ((finalPrice - cost) / finalPrice) * 100 : 0;
    const belowCost = cost > 0 && finalPrice > 0 && finalPrice < cost;
    const diffVal = finalPrice > 0 ? Number((finalPrice - editingItem.preco_loja).toFixed(2)) : 0;
    const diffPct = editingItem.preco_loja > 0 && finalPrice > 0
      ? ((finalPrice - editingItem.preco_loja) / editingItem.preco_loja) * 100
      : 0;
    const med = editingItem.proffer_medio;
    const diffProfferPct = med && med > 0 && finalPrice > 0
      ? Number((((finalPrice - med) / med) * 100).toFixed(1))
      : null;
    let projectedAction = 'SEM_PROFFER';
    if (diffProfferPct !== null) {
      if (diffProfferPct < -toleranciaPct) projectedAction = 'AUMENTAR';
      else if (diffProfferPct > toleranciaPct) projectedAction = 'DIMINUIR';
      else projectedAction = 'MANTER';
    }
    const impactoMensal = editingItem.vendas_30d > 0 && finalPrice > 0
      ? Number(((finalPrice - editingItem.preco_loja) * editingItem.vendas_30d).toFixed(2))
      : 0;
    return {
      raw,
      finalPrice,
      marginPct,
      belowCost,
      diffPct,
      diffVal,
      diffProfferPct,
      projectedAction,
      impactoMensal
    };
  }, [editingItem, novoPrecoInput, arredondarComercial, toleranciaPct]);

  const handleKeepAndNext = async () => {
    if (!editingItem || applyingSingle) return;
    setApplyingSingle(true);
    try {
      const res = await fetch(`/api/levantamento-proffer/itens/${editingItem.produto_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessaoId,
          statusConferencia: 'conferido',
          usuario: user?.name || 'Administrador'
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erro ao marcar como conferido.');
      modalChangedRef.current = true;
      setItems(prev =>
        prev.map(it => it.produto_id === editingItem.produto_id ? { ...it, status_conferencia: 'conferido' } : it)
      );
      fetchResumo();
      const nextIdx = editingIndex + 1;
      if (nextIdx < items.length) {
        loadItemIntoEditor(items[nextIdx], nextIdx);
      } else {
        addToast('Último item desta página marcado como conferido.', 'success');
        individualDialogRef.current?.close();
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao marcar conferido.', 'error');
    } finally {
      setApplyingSingle(false);
    }
  };

  const handleApplySinglePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const shouldAdvance = submitNextRef.current;
    submitNextRef.current = false;

    if (!editingItem || singlePreview.finalPrice <= 0) {
      addToast('Informe um preço válido maior que zero.', 'warning');
      return;
    }
    setApplyingSingle(true);
    try {
      const res = await fetch('/api/levantamento-proffer/aplicar-preco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessaoId,
          produtoId: editingItem.produto_id,
          novoPreco: singlePreview.finalPrice,
          arredondarComercial,
          motivo: motivoInput,
          usuario: user?.name || 'Administrador'
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao aplicar preço no Digifarma.');
      }
      const appliedPrice = Number(json.newPrice || singlePreview.finalPrice);
      const med = editingItem.proffer_medio;
      const newDiffVal = med && med > 0 ? Number((appliedPrice - med).toFixed(2)) : editingItem.diff_proffer_valor;
      const newDiffPct = med && med > 0 ? Number((((appliedPrice - med) / med) * 100).toFixed(1)) : editingItem.diff_proffer_pct;
      const newMargin = editingItem.custo_efetivo > 0 && appliedPrice > 0
        ? Number((((appliedPrice - editingItem.custo_efetivo) / appliedPrice) * 100).toFixed(1))
        : editingItem.margem_atual_pct;
      let newAction = editingItem.acao_recomendada;
      if (newDiffPct !== null && newDiffPct !== undefined) {
        if (newDiffPct < -toleranciaPct) newAction = 'AUMENTAR';
        else if (newDiffPct > toleranciaPct) newAction = 'DIMINUIR';
        else newAction = 'MANTER';
      }

      modalChangedRef.current = true;
      setItems(prev =>
        prev.map(it =>
          it.produto_id === editingItem.produto_id
            ? {
                ...it,
                preco_loja: appliedPrice,
                preco_aplicado: appliedPrice,
                margem_atual_pct: newMargin,
                abaixo_custo: editingItem.custo_efetivo > 0 && appliedPrice < editingItem.custo_efetivo,
                diff_proffer_valor: newDiffVal,
                diff_proffer_pct: newDiffPct,
                acao_recomendada: newAction,
                status_conferencia: 'ajustado'
              }
            : it
        )
      );
      addToast(json.message, 'success');
      fetchResumo();

      const nextIdx = editingIndex + 1;
      if (shouldAdvance && nextIdx < items.length) {
        loadItemIntoEditor(items[nextIdx], nextIdx);
      } else {
        if (shouldAdvance) {
          addToast('Último item desta página concluído!', 'info');
        }
        individualDialogRef.current?.close();
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao aplicar preço.', 'error');
    } finally {
      setApplyingSingle(false);
    }
  };

  // Modal 2: Reajuste em Lote
  const handleApplyBatchPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;
    setApplyingBatch(true);
    try {
      const res = await fetch('/api/levantamento-proffer/aplicar-preco-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessaoId,
          produtoIds: selectedIds,
          estrategia: batchStrategy,
          respeitarPisoCusto,
          usuario: user?.name || 'Administrador'
        })
      });
      const json = await res.json();
      if (json.erros?.length > 0) {
        addToast(`Lote concluído com alertas: ${json.sucessos} aplicados, ${json.ignorados?.length || 0} ignorados, ${json.erros.length} falhas (${json.erros[0].error}).`, 'warning');
      } else {
        addToast(`Reajuste em lote: ${json.sucessos} preços aplicados no Digifarma (${json.ignorados?.length || 0} ignorados).`, 'success');
      }
      batchDialogRef.current?.close();
      setSelectedIds([]);
      fetchProdutos();
      fetchResumo();
    } catch (err: any) {
      addToast(err.message || 'Erro no reajuste em lote.', 'error');
    } finally {
      setApplyingBatch(false);
    }
  };

  // Modal 3: Importar Planilha Proffer
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheet = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[firstSheet], { defval: '' });
      if (rows.length === 0) {
        addToast('Planilha vazia.', 'warning');
        return;
      }
      const headers = Object.keys(rows[0]);
      setImportFileName(file.name);
      setImportHeaders(headers);
      setImportRawRows(rows);
      setColEan(detectarColuna(headers, ['ean', 'codigo de barras', 'cod_barras', 'cod barras', 'barras', 'gtin', 'sku']));
      setColBaixo(detectarColuna(headers, ['baixo', 'minimo', 'min', 'preco baixo', 'menor']));
      setColMedio(detectarColuna(headers, ['medio', 'media', 'proffer', 'preco medio', 'preco']));
      setColAlto(detectarColuna(headers, ['alto', 'maximo', 'max', 'preco alto', 'maior']));
    } catch (err: any) {
      addToast(`Erro ao ler arquivo: ${err.message}`, 'error');
    }
  };

  const mappedImportItems = useMemo(() => {
    if (!colEan || !colMedio || importRawRows.length === 0) return [];
    return importRawRows
      .map(r => {
        const ean = String(r[colEan] ?? '').replace(/\D/g, '').trim();
        const medio = parseFloat(String(r[colMedio] ?? '').replace(/[R$\s]/g, '').replace(',', '.'));
        const baixo = colBaixo ? parseFloat(String(r[colBaixo] ?? '').replace(/[R$\s]/g, '').replace(',', '.')) : NaN;
        const alto = colAlto ? parseFloat(String(r[colAlto] ?? '').replace(/[R$\s]/g, '').replace(',', '.')) : NaN;
        return {
          ean,
          medio: isNaN(medio) ? 0 : medio,
          baixo: isNaN(baixo) ? undefined : baixo,
          alto: isNaN(alto) ? undefined : alto
        };
      })
      .filter(it => it.ean.length >= 7 && it.medio > 0);
  }, [importRawRows, colEan, colBaixo, colMedio, colAlto]);

  const handleConfirmImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mappedImportItems.length === 0) {
      addToast('Nenhum item válido encontrado com o mapeamento atual.', 'warning');
      return;
    }
    setImportingProffer(true);
    try {
      const res = await fetch('/api/levantamento-proffer/importar-proffer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessaoId, itens: mappedImportItems })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erro ao importar planilha.');
      addToast(json.message, 'success');
      importDialogRef.current?.close();
      setImportRawRows([]);
      setImportHeaders([]);
      setImportFileName('');
      fetchResumo();
      fetchProdutos();
      handleTestHealth(true);
    } catch (err: any) {
      addToast(err.message || 'Erro ao importar preços Proffer.', 'error');
    } finally {
      setImportingProffer(false);
    }
  };

  // Modal 4: Novo Levantamento
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingSession(true);
    try {
      const res = await fetch('/api/levantamento-proffer/sessoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: newSessionTitle,
          criterioEscopo: newSessionScope,
          criadoPor: user?.name || 'Administrador'
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erro ao criar sessão.');
      addToast(json.message, 'success');
      newSessionDialogRef.current?.close();
      setNewSessionTitle('');
      await fetchSessoes();
      if (json.sessao?.id) {
        setSessaoId(json.sessao.id);
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao criar levantamento.', 'error');
    } finally {
      setCreatingSession(false);
    }
  };

  // Seleção múltipla na página
  const allOnPageSelected = items.length > 0 && items.every(it => selectedIds.includes(it.produto_id));
  const toggleSelectAllPage = () => {
    if (allOnPageSelected) {
      const pageIds = new Set(items.map(it => it.produto_id));
      setSelectedIds(prev => prev.filter(id => !pageIds.has(id)));
    } else {
      const merged = new Set([...selectedIds, ...items.map(it => it.produto_id)]);
      setSelectedIds(Array.from(merged));
    }
  };
  const toggleSelectRow = (id: number) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const renderSortableHeader = (col: SortKey, label: string, align: 'left' | 'right' | 'center' = 'left') => {
    const isSorted = sortBy === col;
    const ariaSortAttr = isSorted ? { 'aria-sort': (sortDir === 'asc' ? 'ascending' : 'descending') as 'ascending' | 'descending' } : {};
    return (
      <th
        scope="col"
        className={`lp-sort-th whitespace-nowrap p-0 bg-slate-50 dark:bg-slate-800/95 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 ${
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
        }`}
        {...ariaSortAttr}
      >
        <button
          type="button"
          onClick={() => handleSort(col, label)}
          className={`w-full min-h-[34px] px-2.5 py-2 inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500 cursor-pointer ${
            align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
          }`}
        >
          <span>{label}</span>
          <span aria-hidden="true" className="inline-flex items-center shrink-0">
            {isSorted ? (
              sortDir === 'asc' ? <ArrowUp className="w-3 h-3 lp-sort-asc text-blue-600" /> : <ArrowDown className="w-3 h-3 lp-sort-desc text-blue-600" />
            ) : (
              <ArrowUpDown className="w-3 h-3 lp-sort-neutral opacity-45" />
            )}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* HEADER EXECUTIVO */}
      <div className="p-5 md:p-6 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 rounded-3xl text-white shadow-xl border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-400/30 shrink-0">
              <Scale className="w-7 h-7 text-indigo-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black tracking-tight">
                  Levantamento de Ativos & Comparativo Proffer
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Farmácias Independentes
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Mapeamento de produtos fora da média regional para Farmácias Independentes, separando onde aumentar e onde aliviar preços pesados.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Sessão de levantamento"
              value={sessaoId}
              onChange={(e) => { setSessaoId(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-xl bg-slate-800/90 border border-slate-700 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[260px]"
            >
              {sessoes.map(s => (
                <option key={s.id} value={s.id}>
                  {s.titulo} ({s.total_itens})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => newSessionDialogRef.current?.showModal()}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Levantamento</span>
            </button>
          </div>
        </div>

        {/* BARRA DE AÇÕES & STATUS PROFFER */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-3 border-t border-white/10">
          {/* Status Saúde Proffer */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {health ? (
              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border font-bold ${
                  health.profferApiOk
                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                    : 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                }`}
              >
                {health.profferApiOk ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-amber-400" />}
                <span>
                  {health.profferApiOk
                    ? 'Proffer API Online'
                    : `Proffer Indisponível (${health.httpStatus === 400 ? '404 Cliente não encontrado' : (health.errorCode || 'Offline')})`}
                </span>
              </div>
            ) : null}

            {localBaseInfo && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 font-semibold">
                <Database className="w-3.5 h-3.5 text-indigo-300" />
                <span>
                  Base salva: <b>{localBaseInfo.total.toLocaleString('pt-BR')}</b> ({localBaseInfo.comFaixaReal.toLocaleString('pt-BR')} c/ faixa real • {formatDateShort(localBaseInfo.ultimaAtualizacao)})
                </span>
              </div>
            )}
          </div>

          {/* Botões Operacionais */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleTestHealth(false)}
              disabled={testingHealth}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingHealth ? 'animate-spin' : ''}`} />
              <span>Testar Proffer</span>
            </button>

            <div className="inline-flex items-center rounded-xl bg-indigo-600/30 border border-indigo-400/30 overflow-hidden">
              <select
                aria-label="Escopo de coleta Proffer"
                value={coletaEscopo}
                onChange={(e) => setColetaEscopo(e.target.value as 'sem_proffer' | 'levantamento')}
                disabled={scrapeStatus.running}
                className="bg-transparent px-2.5 py-2 text-[11px] font-bold text-indigo-100 focus:outline-none border-r border-indigo-400/30"
              >
                <option value="sem_proffer" className="bg-slate-900">Só sem Proffer</option>
                <option value="levantamento" className="bg-slate-900">Todo Levantamento</option>
              </select>
              {scrapeStatus.running ? (
                <button
                  type="button"
                  onClick={handlePararColeta}
                  className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Parar ({scrapeStatus.currentProgress}/{scrapeStatus.totalItems})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDispararColeta}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  title="Testa o Proffer antes de iniciar e nunca sobrescreve preços reais"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Atualizar Proffer</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => importDialogRef.current?.showModal()}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Importar Planilha</span>
            </button>

            <button
              type="button"
              onClick={handleSyncDigifarma}
              disabled={syncingDigifarma}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingDigifarma ? 'animate-spin' : ''}`} />
              <span>Sincronizar Digifarma</span>
            </button>

            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              disabled={exporting}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
              <span>Excel</span>
            </button>

            <button
              type="button"
              onClick={() => handleExport('csv')}
              disabled={exporting}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-sky-300" />
              <span>CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* 6 CARDS KPI CLICÁVEIS — FOCO FARMÁCIAS INDEPENDENTES */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => selectActionTab('FORA_DA_MEDIA')}
          className={`text-left p-4 rounded-2xl border shadow-xs transition-all cursor-pointer ${
            acaoFilter === 'FORA_DA_MEDIA'
              ? 'bg-indigo-600/15 border-indigo-500 ring-2 ring-indigo-500/40'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
          }`}
        >
          <div className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Fora da Média Indep.</div>
          <div className="text-2xl font-black text-indigo-700 dark:text-indigo-300 mt-0.5 tabular-nums">
            {(resumo?.foraDaMediaTotal || 0).toLocaleString('pt-BR')}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-semibold tabular-nums">
            Tolerância ±{toleranciaPct}% {apenasFaixaReal ? '• Faixa real' : '• Todas'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectActionTab('AUMENTAR')}
          className={`text-left p-4 rounded-2xl border shadow-xs transition-all cursor-pointer ${
            acaoFilter === 'AUMENTAR'
              ? 'bg-amber-500/20 border-amber-500 ring-2 ring-amber-500/40'
              : 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30'
          }`}
        >
          <div className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-wider">↑ Onde Aumentar</div>
          <div className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-0.5 tabular-nums">
            {(resumo?.ondeAumentar || 0).toLocaleString('pt-BR')}
          </div>
          <div className="text-[10px] text-amber-700/80 dark:text-amber-400 mt-1 font-bold tabular-nums">
            Potencial +{formatMoney(resumo?.potencialAumentoMensal || 0)}/mês
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectActionTab('DIMINUIR')}
          className={`text-left p-4 rounded-2xl border shadow-xs transition-all cursor-pointer ${
            acaoFilter === 'DIMINUIR'
              ? 'bg-sky-500/20 border-sky-500 ring-2 ring-sky-500/40'
              : 'bg-sky-500/10 hover:bg-sky-500/15 border-sky-500/30'
          }`}
        >
          <div className="text-[10px] font-black uppercase text-sky-700 dark:text-sky-400 tracking-wider">↓ Onde Diminuir</div>
          <div className="text-2xl font-black text-sky-700 dark:text-sky-300 mt-0.5 tabular-nums">
            {(resumo?.ondeDiminuir || 0).toLocaleString('pt-BR')}
          </div>
          <div className="text-[10px] text-sky-700/80 dark:text-sky-400 mt-1 font-bold tabular-nums">
            Pesados +{Number(resumo?.excessoMedioPctPesados || 0).toFixed(1)}% acima média
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectActionTab('NA_MEDIA')}
          className={`text-left p-4 rounded-2xl border shadow-xs transition-all cursor-pointer ${
            acaoFilter === 'NA_MEDIA'
              ? 'bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-500/40'
              : 'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/30'
          }`}
        >
          <div className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">✓ Na Média Indep.</div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5 tabular-nums">
            {(resumo?.naMediaIndependentes || 0).toLocaleString('pt-BR')}
          </div>
          <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400 mt-1 font-bold">
            Competitivos (±{toleranciaPct}%)
          </div>
        </button>

        <button
          type="button"
          onClick={() => { setAcaoFilter('ALL'); setMargemFilter(prev => prev === 'ABAIXO_CUSTO' ? 'ALL' : 'ABAIXO_CUSTO'); setPage(1); }}
          className="text-left p-4 bg-red-500/10 hover:bg-red-500/15 rounded-2xl border border-red-500/30 shadow-xs transition-all cursor-pointer"
        >
          <div className="text-[10px] font-black uppercase text-red-700 dark:text-red-400 tracking-wider">Abaixo Custo / Neg.</div>
          <div className="text-2xl font-black text-red-700 dark:text-red-300 mt-0.5 tabular-nums">
            {resumo?.abaixoCusto || 0} <span className="text-sm font-bold opacity-70">/ {resumo?.saldoNegativo || 0} neg</span>
          </div>
          <div className="text-[10px] text-red-700/80 dark:text-red-400 mt-1 font-bold">
            Alerta de margem ou furo
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectActionTab('ALL')}
          className="text-left p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-blue-400 transition-all cursor-pointer"
        >
          <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Ativos & Faixa Real</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
            {(resumo?.comFaixaRealIndependentes || 0).toLocaleString('pt-BR')}
            <span className="text-xs font-bold text-slate-400 ml-1">/ {(resumo?.totalItens || 0).toLocaleString('pt-BR')}</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-semibold tabular-nums">
            {resumo?.coberturaProfferPct || 0}% Proffer • +{resumo?.saldoPositivo || 0} / -{resumo?.saldoNegativo || 0}
          </div>
        </button>
      </div>

      {/* BARRA DE PROGRESSO DO LEVANTAMENTO */}
      {resumo && (
        <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-500" />
                Progresso do Levantamento ({resumo.conferencia.progressoPct}%)
              </span>
              <span className="text-slate-500 tabular-nums">
                {(resumo.conferencia.conferido + resumo.conferencia.ajustado + resumo.conferencia.ignorado).toLocaleString('pt-BR')} / {resumo.totalItens.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${Math.min(100, resumo.conferencia.progressoPct)}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
            {[
              { id: 'pendente', label: `Pendentes (${resumo.conferencia.pendente})`, cls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300' },
              { id: 'conferido', label: `Conferidos (${resumo.conferencia.conferido})`, cls: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300' },
              { id: 'ajustado', label: `Ajustados (${resumo.conferencia.ajustado})`, cls: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' },
              { id: 'ignorado', label: `Ignorados (${resumo.conferencia.ignorado})`, cls: 'bg-slate-200 dark:bg-slate-800 text-slate-500' }
            ].map(st => (
              <button
                key={st.id}
                type="button"
                onClick={() => { setStatusConferencia(prev => prev === st.id ? 'ALL' : st.id); setPage(1); }}
                className={`px-2.5 py-1 rounded-xl transition-all cursor-pointer ${st.cls} ${
                  statusConferencia === st.id ? 'ring-2 ring-indigo-500' : 'opacity-85 hover:opacity-100'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* BARRA DE AÇÕES: ONDE AUMENTAR / ONDE DIMINUIR + TOLERÂNCIA + REVISÃO 1 POR 1 */}
      <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Recorte de ação em Farmácias Independentes">
          {[
            {
              id: 'FORA_DA_MEDIA' as AcaoTab,
              label: `Fora da Média (${(resumo?.foraDaMediaTotal || 0).toLocaleString('pt-BR')})`,
              activeCls: 'bg-indigo-600 text-white shadow-xs',
              idleCls: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300'
            },
            {
              id: 'AUMENTAR' as AcaoTab,
              label: `↑ Onde Aumentar (${(resumo?.ondeAumentar || 0).toLocaleString('pt-BR')})`,
              activeCls: 'bg-amber-600 text-white shadow-xs',
              idleCls: 'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300'
            },
            {
              id: 'DIMINUIR' as AcaoTab,
              label: `↓ Onde Diminuir / Pesados (${(resumo?.ondeDiminuir || 0).toLocaleString('pt-BR')})`,
              activeCls: 'bg-sky-600 text-white shadow-xs',
              idleCls: 'bg-sky-50 text-sky-800 hover:bg-sky-100 dark:bg-sky-950/50 dark:text-sky-300'
            },
            {
              id: 'NA_MEDIA' as AcaoTab,
              label: `✓ Na Média (${(resumo?.naMediaIndependentes || 0).toLocaleString('pt-BR')})`,
              activeCls: 'bg-emerald-600 text-white shadow-xs',
              idleCls: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300'
            },
            {
              id: 'ALL' as AcaoTab,
              label: `Todos (${(resumo?.totalItens || 0).toLocaleString('pt-BR')})`,
              activeCls: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs',
              idleCls: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={acaoFilter === tab.id}
              onClick={() => selectActionTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer tabular-nums ${
                acaoFilter === tab.id ? tab.activeCls : tab.idleCls
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
            <span>Tolerância:</span>
            <select
              aria-label="Tolerância fora da média"
              value={toleranciaPct}
              onChange={(e) => { setToleranciaPct(Number(e.target.value)); setPage(1); }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-black text-slate-900 dark:text-white tabular-nums"
            >
              {TOLERANCIA_OPCOES.map(pct => (
                <option key={pct} value={pct}>±{pct}%</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={apenasFaixaReal}
              onChange={(e) => { setApenasFaixaReal(e.target.checked); setPage(1); }}
              className="rounded border-slate-300 cursor-pointer"
            />
            <span>Só faixa real Indep. (Baixo ≠ Alto)</span>
          </label>

          <button
            type="button"
            onClick={openSequentialQueue}
            disabled={loading || items.length === 0}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Corrigir 1 por 1</span>
          </button>
        </div>
      </div>

      {/* PAINEL DE FILTROS (2 LINHAS) */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        {/* Linha 1: Busca + Recorte + Curva */}
        <div className="flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Buscar por descrição, EAN ou código Digifarma..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {(['ALL', 'A', 'B', 'C'] as const).map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { setCurva(c); setPage(1); }}
                className={`px-2.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  curva === c
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {c === 'ALL' ? 'Todas Curvas' : `Curva ${c}`}
              </button>
            ))}
          </div>
        </div>

        {/* Pílulas de Recorte Estoque/Movimentação */}
        <div className="flex flex-wrap items-center gap-1.5">
          {RECORTES.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => { setRecorte(r.id); setPage(1); }}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                recorte === r.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Linha 2: Selects avançados */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <select
            aria-label="Posição Proffer"
            value={profferStatus}
            onChange={(e) => {
              const val = e.target.value;
              setProfferStatus(val);
              if (
                ((val === 'SEM_PROFFER' || val === 'COM_PROFFER' || val === 'NA_MEDIA') && acaoFilter !== 'ALL') ||
                ((val === 'ABAIXO_MINIMO' || val === 'ABAIXO_MEDIA') && (acaoFilter === 'DIMINUIR' || acaoFilter === 'NA_MEDIA')) ||
                ((val === 'ACIMA_MAXIMO' || val === 'ACIMA_MEDIA') && (acaoFilter === 'AUMENTAR' || acaoFilter === 'NA_MEDIA'))
              ) {
                setAcaoFilter('ALL');
              }
              setPage(1);
            }}
            className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200"
          >
            <option value="ALL">Proffer: Todos</option>
            <option value="ABAIXO_MEDIA">Abaixo da Média</option>
            <option value="ABAIXO_MINIMO">Abaixo do Mínimo</option>
            <option value="NA_MEDIA">Na Média (±{toleranciaPct}%)</option>
            <option value="ACIMA_MEDIA">Acima da Média</option>
            <option value="ACIMA_MAXIMO">Acima do Máximo</option>
            <option value="COM_PROFFER">Com Preço Proffer</option>
            <option value="SEM_PROFFER">Sem Preço Proffer</option>
          </select>

          <select
            aria-label="Desvio mínimo"
            value={desvioMinPct}
            onChange={(e) => { setDesvioMinPct(e.target.value); setPage(1); }}
            className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200"
          >
            <option value="0">Desvio: Qualquer</option>
            {[5, 10, 15, 20, 30].map(v => (
              <option key={v} value={String(v)}>
                {acaoFilter === 'DIMINUIR'
                  ? `≥ ${v}% acima Proffer`
                  : acaoFilter === 'FORA_DA_MEDIA'
                  ? `≥ ${v}% fora da média`
                  : `≥ ${v}% abaixo Proffer`}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtro de Margem"
            value={margemFilter}
            onChange={(e) => { setMargemFilter(e.target.value); setPage(1); }}
            className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200"
          >
            <option value="ALL">Margem: Todas</option>
            <option value="ABAIXO_CUSTO">Abaixo do Custo</option>
            <option value="MARGEM_BAIXA">Margem Baixa (&lt;20%)</option>
            <option value="MARGEM_OK">Margem Normal (20-50%)</option>
            <option value="MARGEM_ALTA">Margem Alta (&gt;50%)</option>
          </select>

          <select
            aria-label="Categoria"
            value={categoria}
            onChange={(e) => { setCategoria(e.target.value); setPage(1); }}
            className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200"
          >
            <option value="ALL">Categoria: Todas</option>
            <option value="GENERICO">Genéricos</option>
            <option value="SIMILAR">Similares</option>
            <option value="PERFUMARIA">Perfumaria</option>
            <option value="MARCA">Marca / Referência</option>
          </select>

          <select
            aria-label="Status de conferência"
            value={statusConferencia}
            onChange={(e) => { setStatusConferencia(e.target.value); setPage(1); }}
            className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200"
          >
            <option value="ALL">Status: Todos</option>
            <option value="pendente">Pendente</option>
            <option value="conferido">Conferido</option>
            <option value="ajustado">Ajustado</option>
            <option value="ignorado">Ignorado</option>
          </select>

          <button
            type="button"
            onClick={resetFilters}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>Limpar Filtros</span>
          </button>
        </div>

        {/* BARRA CONTEXTUAL DE AÇÕES EM LOTE */}
        {selectedIds.length > 0 && (
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black text-indigo-800 dark:text-indigo-200">
              {selectedIds.length} {selectedIds.length === 1 ? 'produto selecionado' : 'produtos selecionados'}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleBatchStatus('conferido')}
                className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
              >
                Marcar Conferidos
              </button>
              <button
                type="button"
                onClick={() => handleBatchStatus('ignorado')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold cursor-pointer"
              >
                Ignorar
              </button>
              <button
                type="button"
                onClick={() => batchDialogRef.current?.showModal()}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black cursor-pointer"
              >
                Reajustar em Lote
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Limpar Seleção
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ANÚNCIO DE ORDENAÇÃO (fora da tabela, nunca aria-live na <table>) */}
      <div role="status" className="sr-only">
        {sortAnnouncement}
      </div>

      {/* TABELA DE ALTA DENSIDADE */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-slate-500 tabular-nums">
            Exibindo {items.length} de {totalItems.toLocaleString('pt-BR')} produtos
          </span>
          <div className="flex items-center gap-2">
            <label className="text-slate-500 font-semibold flex items-center gap-1.5">
              <span>Por página:</span>
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </label>
            <span className="font-black text-slate-700 dark:text-slate-300 tabular-nums">
              Página {page} / {totalPages}
            </span>
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="levantamento-proffer-caption"
          className="lp-table-region overflow-auto max-h-[68vh] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <table className="w-full min-w-[1060px] text-left text-xs border-separate border-spacing-0">
            <caption id="levantamento-proffer-caption" className="sr-only">
              Levantamento de produtos ativos e comparativo de preços Proffer
            </caption>
            <thead className="sticky top-0 z-10">
              <tr>
                <th scope="col" className="whitespace-nowrap w-9 px-2.5 py-2 bg-slate-50 dark:bg-slate-800/95 border-b border-slate-200 dark:border-slate-800 text-center">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos desta página"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAllPage}
                    className="rounded border-slate-300 cursor-pointer"
                  />
                </th>
                {renderSortableHeader('descricao', 'Produto', 'left')}
                {renderSortableHeader('saldo', 'Saldo', 'right')}
                {renderSortableHeader('vendas30d', 'Mov. 30d/10m', 'right')}
                {renderSortableHeader('custo', 'Custo', 'right')}
                {renderSortableHeader('preco', 'Loja / Margem', 'right')}
                {renderSortableHeader('proffer', 'Proffer (Indep.)', 'right')}
                {renderSortableHeader(acaoFilter === 'FORA_DA_MEDIA' ? 'desvio_abs' : 'desvio', 'Desvio / Ação', 'right')}
                {renderSortableHeader('status', 'Status', 'center')}
                <th scope="col" className="whitespace-nowrap px-2.5 py-2 bg-slate-50 dark:bg-slate-800/95 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Carregando levantamento...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    Nenhum produto encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const selected = selectedIds.includes(item.produto_id);
                  const diffPct = item.diff_proffer_pct;
                  const diffVal = item.diff_proffer_valor;

                  return (
                    <tr
                      key={item.produto_id}
                      className={`hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors ${
                        item.status_conferencia === 'ignorado' ? 'opacity-55' : ''
                      }`}
                    >
                      <td className="px-2.5 py-2 text-center border-b border-slate-100 dark:border-slate-800/80">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${item.descricao}`}
                          checked={selected}
                          onChange={() => toggleSelectRow(item.produto_id)}
                          className="rounded border-slate-300 cursor-pointer"
                        />
                      </td>

                      {/* Produto (th row sticky em md+) */}
                      <th
                        scope="row"
                        className="md:sticky md:left-0 z-[1] bg-white dark:bg-slate-900 px-2.5 py-2 text-left font-normal border-b border-slate-100 dark:border-slate-800/80 max-w-[340px]"
                      >
                        <div className="font-bold text-slate-900 dark:text-white truncate" title={item.descricao}>
                          {item.descricao}
                        </div>
                        <div className="text-[10px] text-slate-400 inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span>Cód {item.produto_id}</span>
                          <span>•</span>
                          <span>{item.ean || 'Sem EAN'}</span>
                          <span>•</span>
                          <span
                            className={`px-1 rounded font-black ${
                              item.curva_abc === 'A'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : item.curva_abc === 'B'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {item.curva_abc}
                          </span>
                          <span>•</span>
                          <span className="uppercase">{item.categoria_class}</span>
                        </div>
                      </th>

                      {/* Saldo */}
                      <td className="px-2.5 py-2 text-right whitespace-nowrap border-b border-slate-100 dark:border-slate-800/80 tabular-nums">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-black ${
                            item.saldo < 0
                              ? 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300'
                              : item.saldo > 0
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {item.saldo}
                        </span>
                      </td>

                      {/* Movimentação */}
                      <td
                        className="px-2.5 py-2 text-right whitespace-nowrap border-b border-slate-100 dark:border-slate-800/80 tabular-nums"
                        title={`30d: ${item.vendas_30d} | 31-60d: ${item.vendas_31_60d} | 61-90d: ${item.vendas_61_90d} | 10m: ${item.vendas_10m} | Entradas 10m: ${item.entradas_10m}`}
                      >
                        <div className="inline-flex items-center justify-end gap-1 font-bold text-slate-700 dark:text-slate-200">
                          {item.ciclo_vida === 'CRESCIMENTO' || item.ciclo_vida === 'LANCAMENTO' ? (
                            <TrendingUp className="w-3 h-3 text-emerald-500" aria-hidden="true" />
                          ) : item.ciclo_vida === 'DECLINIO' ? (
                            <TrendingDown className="w-3 h-3 text-rose-500" aria-hidden="true" />
                          ) : null}
                          <span>{item.vendas_30d}</span>
                          <span className="text-slate-400 font-normal">/ {item.vendas_10m}</span>
                        </div>
                      </td>

                      {/* Custo */}
                      <td className="px-2.5 py-2 text-right whitespace-nowrap border-b border-slate-100 dark:border-slate-800/80 tabular-nums text-slate-600 dark:text-slate-300 font-semibold">
                        {item.custo_efetivo > 0 ? formatMoney(item.custo_efetivo) : '—'}
                      </td>

                      {/* Loja / Margem */}
                      <td className="px-2.5 py-2 text-right whitespace-nowrap border-b border-slate-100 dark:border-slate-800/80 tabular-nums">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <span className="font-black text-slate-900 dark:text-white">{formatMoney(item.preco_loja)}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                              item.abaixo_custo
                                ? 'bg-red-600 text-white'
                                : item.margem_atual_pct < 20
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                            }`}
                          >
                            {item.margem_atual_pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>

                      {/* Proffer (Independentes) */}
                      <td
                        className="px-2.5 py-2 text-right whitespace-nowrap border-b border-slate-100 dark:border-slate-800/80 tabular-nums"
                        title={
                          item.proffer_medio
                            ? `Indep. Baixo: ${formatMoney(item.proffer_baixo)} | Médio: ${formatMoney(item.proffer_medio)} | Alto: ${formatMoney(item.proffer_alto)} (${formatDateShort(item.proffer_atualizado_em)})`
                            : 'Sem preço Proffer salvo'
                        }
                      >
                        {item.proffer_medio ? (
                          <div className="inline-flex flex-col items-end">
                            <div className="font-black text-indigo-700 dark:text-indigo-300">{formatMoney(item.proffer_medio)}</div>
                            <div className="text-[10px] text-slate-400">
                              {item.tem_faixa_real
                                ? `${formatMoney(item.proffer_baixo)} – ${formatMoney(item.proffer_alto)}`
                                : 'Preço único'}
                            </div>
                            {item.tem_faixa_real && item.proffer_baixo && item.proffer_alto && item.proffer_alto > item.proffer_baixo && (() => {
                              const span = item.proffer_alto - item.proffer_baixo;
                              const rawPos = ((item.preco_loja - item.proffer_baixo) / span) * 100;
                              const dotLeft = Math.max(0, Math.min(100, rawPos));
                              const dotColor =
                                item.acao_recomendada === 'AUMENTAR'
                                  ? 'bg-amber-500'
                                  : item.acao_recomendada === 'DIMINUIR'
                                  ? 'bg-sky-500'
                                  : 'bg-emerald-500';
                              return (
                                <div className="mt-1 w-20 h-1 bg-slate-200 dark:bg-slate-700 rounded-full relative" aria-hidden="true">
                                  <span
                                    className={`w-2 h-2 rounded-full ${dotColor} ring-1 ring-white dark:ring-slate-900 absolute top-1/2 -translate-y-1/2 -translate-x-1/2`}
                                    style={{ left: `${dotLeft}%` }}
                                  />
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Sem Proffer</span>
                        )}
                      </td>

                      {/* Desvio / Ação */}
                      <td className="px-2.5 py-2 text-right whitespace-nowrap border-b border-slate-100 dark:border-slate-800/80 tabular-nums">
                        {diffPct !== null && diffVal !== null ? (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <div className="inline-flex items-center gap-1">
                              {item.acao_recomendada === 'AUMENTAR' && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 text-[9px] font-black">
                                  ↑ AUMENTAR
                                </span>
                              )}
                              {item.acao_recomendada === 'DIMINUIR' && (
                                <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 text-[9px] font-black">
                                  ↓ DIMINUIR
                                </span>
                              )}
                              {item.acao_recomendada === 'MANTER' && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 text-[9px] font-black">
                                  ✓ OK
                                </span>
                              )}
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                  item.posicao_proffer === 'ABAIXO_MINIMO'
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                                    : item.posicao_proffer === 'ABAIXO_MEDIA'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                    : item.posicao_proffer === 'ACIMA_MAXIMO'
                                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {diffPct > 0 ? `+${diffPct.toFixed(1)}%` : `${diffPct.toFixed(1)}%`}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {diffVal >= 0 ? `+${formatMoney(diffVal)}` : formatMoney(diffVal)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-2.5 py-2 text-center whitespace-nowrap border-b border-slate-100 dark:border-slate-800/80">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            item.status_conferencia === 'ajustado'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                              : item.status_conferencia === 'conferido'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300'
                              : item.status_conferencia === 'ignorado'
                              ? 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {item.status_conferencia}
                        </span>
                      </td>

                      {/* Ações compactas por ícone */}
                      <td className="px-2.5 py-2 text-right whitespace-nowrap border-b border-slate-100 dark:border-slate-800/80">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleItemStatus(
                                item.produto_id,
                                item.status_conferencia === 'conferido' ? 'pendente' : 'conferido'
                              )
                            }
                            title={item.status_conferencia === 'conferido' ? 'Reabrir como pendente' : 'Marcar como conferido'}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                              item.status_conferencia === 'conferido'
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditDialog(item, idx)}
                            title="Ajustar preço no Digifarma com comparação Proffer (Independentes)"
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-indigo-400 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleItemStatus(
                                item.produto_id,
                                item.status_conferencia === 'ignorado' ? 'pendente' : 'ignorado'
                              )
                            }
                            title={item.status_conferencia === 'ignorado' ? 'Reabrir item' : 'Ignorar item neste levantamento'}
                            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                          >
                            {item.status_conferencia === 'ignorado' ? <RotateCcw className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINAÇÃO */}
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-500 font-semibold tabular-nums">
            Total filtrado: <b>{totalItems.toLocaleString('pt-BR')}</b> produtos
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page <= 1}
              title="Primeira página"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              title="Página anterior"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 font-black text-slate-700 dark:text-slate-200 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              title="Próxima página"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              title="Última página"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1 — REVISÃO MANUAL SEQUENCIAL 1 POR 1 (<dialog> nativo) */}
      <dialog
        ref={individualDialogRef}
        aria-labelledby="lp-single-title"
        onClose={(e) => {
          e.currentTarget.returnValue = '';
          setEditingItem(null);
          setEditingIndex(-1);
          if (modalChangedRef.current) {
            modalChangedRef.current = false;
            fetchProdutos();
            fetchResumo();
          }
        }}
        className="lp-dialog m-auto w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl p-0 overflow-hidden"
      >
        {editingItem && (
          <form onSubmit={handleApplySinglePrice} className="p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Cabeçalho com posição da fila e ação recomendada */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-[10px] font-black tabular-nums">
                    Item {editingIndex >= 0 ? editingIndex + 1 : 1} de {items.length} (Pág. {page})
                  </span>
                  {editingItem.acao_recomendada === 'AUMENTAR' && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[10px] font-black">
                      ↑ OPORTUNIDADE DE AUMENTO ({editingItem.diff_proffer_pct?.toFixed(1)}%)
                    </span>
                  )}
                  {editingItem.acao_recomendada === 'DIMINUIR' && (
                    <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 text-[10px] font-black">
                      ↓ PREÇO PESADO (+{editingItem.diff_proffer_pct?.toFixed(1)}%)
                    </span>
                  )}
                  {editingItem.acao_recomendada === 'MANTER' && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[10px] font-black">
                      ✓ DENTRO DA MÉDIA ({editingItem.diff_proffer_pct?.toFixed(1)}%)
                    </span>
                  )}
                </div>
                <h2 id="lp-single-title" className="text-base font-black leading-snug truncate" title={editingItem.descricao}>
                  {editingItem.descricao}
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                  Cód {editingItem.produto_id} • EAN {editingItem.ean || 'Sem EAN'} • Curva {editingItem.curva_abc} • Estoque {editingItem.saldo} • 30d: {editingItem.vendas_30d} un
                </p>
              </div>
              <button
                type="button"
                onClick={() => individualDialogRef.current?.close()}
                aria-label="Fechar janela"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cards comparativos */}
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800">
                <div className="text-[10px] font-black uppercase text-slate-400">Custo Efetivo</div>
                <div className="text-sm font-black mt-0.5 tabular-nums">{formatMoney(editingItem.custo_efetivo)}</div>
                <div className="text-[10px] text-slate-400">10m: {editingItem.vendas_10m} un</div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800">
                <div className="text-[10px] font-black uppercase text-slate-400">Loja Atual</div>
                <div className="text-sm font-black mt-0.5 tabular-nums">{formatMoney(editingItem.preco_loja)}</div>
                <div className="text-[10px] text-slate-400">Margem {editingItem.margem_atual_pct.toFixed(1)}%</div>
              </div>
              <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800">
                <div className="text-[10px] font-black uppercase text-indigo-500">Média Indep. Proffer</div>
                <div className="text-sm font-black text-indigo-700 dark:text-indigo-300 mt-0.5 tabular-nums">
                  {formatMoney(editingItem.proffer_medio)}
                </div>
                <div className="text-[10px] text-indigo-500/90 tabular-nums">
                  {editingItem.proffer_baixo ? `${formatMoney(editingItem.proffer_baixo)} – ${formatMoney(editingItem.proffer_alto)}` : '—'}
                </div>
              </div>
            </div>

            {/* Régua Visual de Faixa Regional */}
            {editingItem.proffer_medio && editingItem.proffer_medio > 0 && (() => {
              const vals = [
                editingItem.custo_efetivo > 0 ? editingItem.custo_efetivo : editingItem.preco_loja,
                editingItem.proffer_baixo || editingItem.proffer_medio,
                editingItem.proffer_alto || editingItem.proffer_medio,
                editingItem.preco_loja,
                singlePreview.finalPrice > 0 ? singlePreview.finalPrice : editingItem.preco_loja
              ];
              const minR = Math.min(...vals) * 0.92;
              const maxR = Math.max(...vals) * 1.08;
              const span = Math.max(0.01, maxR - minR);
              const pct = (v: number) => Math.max(2, Math.min(98, ((v - minR) / span) * 100));
              const lowPct = editingItem.proffer_baixo ? pct(editingItem.proffer_baixo) : pct(editingItem.proffer_medio);
              const highPct = editingItem.proffer_alto ? pct(editingItem.proffer_alto) : pct(editingItem.proffer_medio);
              const medPct = pct(editingItem.proffer_medio);
              const lojaPct = pct(editingItem.preco_loja);
              const novoPct = singlePreview.finalPrice > 0 ? pct(singlePreview.finalPrice) : lojaPct;

              return (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-400">
                    <span>Régua Regional Independentes</span>
                    <span className="tabular-nums text-indigo-600 dark:text-indigo-400">
                      Faixa: {formatMoney(editingItem.proffer_baixo)} → {formatMoney(editingItem.proffer_alto)}
                    </span>
                  </div>
                  <div className="relative h-6 flex items-center" aria-hidden="true">
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 relative">
                      <div
                        className="absolute top-0 bottom-0 rounded-full bg-indigo-300/70 dark:bg-indigo-600/50"
                        style={{ left: `${lowPct}%`, width: `${Math.max(2, highPct - lowPct)}%` }}
                      />
                      {editingItem.custo_efetivo > 0 && (
                        <span
                          title={`Custo: ${formatMoney(editingItem.custo_efetivo)}`}
                          className="w-0.5 h-3.5 bg-red-500 absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                          style={{ left: `${pct(editingItem.custo_efetivo)}%` }}
                        />
                      )}
                      <span
                        title={`Média Indep.: ${formatMoney(editingItem.proffer_medio)}`}
                        className="w-1 h-4 rounded-full bg-indigo-600 dark:bg-indigo-400 absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                        style={{ left: `${medPct}%` }}
                      />
                      <span
                        title={`Loja Atual: ${formatMoney(editingItem.preco_loja)}`}
                        className="w-2.5 h-2.5 rounded-full bg-slate-600 dark:bg-slate-300 ring-2 ring-white dark:ring-slate-900 absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                        style={{ left: `${lojaPct}%` }}
                      />
                      {singlePreview.finalPrice > 0 && (
                        <span
                          title={`Novo Preço: ${formatMoney(singlePreview.finalPrice)}`}
                          className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 shadow absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all"
                          style={{ left: `${novoPct}%` }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 font-semibold">
                    <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Custo</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-indigo-600 mr-1" />Média Indep.</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-slate-600 dark:bg-slate-300 mr-1" />Atual Loja</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />Novo Preço</span>
                  </div>
                </div>
              );
            })()}

            {/* Atalhos rápidos */}
            <div className="flex flex-wrap gap-1.5">
              {editingItem.preco_sugerido_media && (
                <button
                  type="button"
                  onClick={() => {
                    setNovoPrecoInput(editingItem.preco_sugerido_media!.toFixed(2));
                    setMotivoInput(`Alinhamento Média Indep. Proffer (${formatMoney(editingItem.proffer_medio)})`);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 text-indigo-800 text-[11px] font-black cursor-pointer tabular-nums"
                >
                  Média Indep.: {formatMoney(editingItem.preco_sugerido_media)}
                </button>
              )}
              {editingItem.preco_sugerido_menos_5 && (
                <button
                  type="button"
                  onClick={() => {
                    setNovoPrecoInput(editingItem.preco_sugerido_menos_5!.toFixed(2));
                    setMotivoInput(`Alinhamento Média Indep. -5% (${formatMoney(editingItem.proffer_medio)})`);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-sky-100 hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-300 text-sky-800 text-[11px] font-black cursor-pointer tabular-nums"
                >
                  Média -5%: {formatMoney(editingItem.preco_sugerido_menos_5)}
                </button>
              )}
              {editingItem.preco_sugerido_proffer_menos_10 && (
                <button
                  type="button"
                  onClick={() => {
                    setNovoPrecoInput(editingItem.preco_sugerido_proffer_menos_10!.toFixed(2));
                    setMotivoInput(`Estratégico Média Indep. -10% (${formatMoney(editingItem.proffer_medio)})`);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 text-emerald-800 text-[11px] font-black cursor-pointer tabular-nums"
                >
                  Média -10%: {formatMoney(editingItem.preco_sugerido_proffer_menos_10)}
                </button>
              )}
              {editingItem.proffer_baixo && (
                <button
                  type="button"
                  onClick={() => {
                    const p = editingItem.preco_sugerido_baixo || roundUpToAcceptedCents(editingItem.proffer_baixo!);
                    setNovoPrecoInput(p.toFixed(2));
                    setMotivoInput(`Alinhamento Mínimo Indep. Proffer (${formatMoney(editingItem.proffer_baixo)})`);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300 text-amber-800 text-[11px] font-black cursor-pointer tabular-nums"
                >
                  Mínimo Indep.: {formatMoney(editingItem.preco_sugerido_baixo || roundUpToAcceptedCents(editingItem.proffer_baixo))}
                </button>
              )}
              {editingItem.proffer_alto && editingItem.tem_faixa_real && (
                <button
                  type="button"
                  onClick={() => {
                    const p = editingItem.preco_sugerido_alto || roundUpToAcceptedCents(editingItem.proffer_alto!);
                    setNovoPrecoInput(p.toFixed(2));
                    setMotivoInput(`Alinhamento Máximo Indep. Proffer (${formatMoney(editingItem.proffer_alto)})`);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-violet-100 hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-300 text-violet-800 text-[11px] font-black cursor-pointer tabular-nums"
                >
                  Máximo Indep.: {formatMoney(editingItem.preco_sugerido_alto || roundUpToAcceptedCents(editingItem.proffer_alto))}
                </button>
              )}
              {editingItem.preco_sugerido_markup && (
                <button
                  type="button"
                  onClick={() => {
                    setNovoPrecoInput(editingItem.preco_sugerido_markup!.toFixed(2));
                    setMotivoInput('Formação por Markup Padrão BelaFarma');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 text-slate-800 text-[11px] font-black cursor-pointer tabular-nums"
                >
                  Markup Loja: {formatMoney(editingItem.preco_sugerido_markup)}
                </button>
              )}
            </div>

            {/* Campo numérico + ajuste fino + simulação ao vivo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase text-slate-500 block">Novo Preço Manual (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  autoFocus
                  required
                  value={novoPrecoInput}
                  onChange={(e) => setNovoPrecoInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: '-10%', mode: 'pct' as const, delta: -10 },
                    { label: '-5%', mode: 'pct' as const, delta: -5 },
                    { label: '-R$ 1', mode: 'abs' as const, delta: -1 },
                    { label: '+R$ 1', mode: 'abs' as const, delta: 1 },
                    { label: '+5%', mode: 'pct' as const, delta: 5 },
                    { label: '+10%', mode: 'pct' as const, delta: 10 }
                  ].map(adj => (
                    <button
                      key={adj.label}
                      type="button"
                      onClick={() => adjustNovoPreco(adj.mode, adj.delta)}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] font-black text-slate-700 dark:text-slate-200 cursor-pointer tabular-nums"
                    >
                      {adj.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={arredondarComercial}
                    onChange={(e) => setArredondarComercial(e.target.checked)}
                    className="rounded border-slate-300 cursor-pointer"
                  />
                  <span>Arredondar centavos (0, 5 ou 9)</span>
                </label>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 text-xs flex flex-col justify-between space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Preço Final Aplicado:</span>
                  <b className="text-sm text-indigo-700 dark:text-indigo-300 tabular-nums">{formatMoney(singlePreview.finalPrice)}</b>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Variação vs Atual:</span>
                  <b className={`tabular-nums ${singlePreview.diffVal >= 0 ? 'text-emerald-600' : 'text-sky-600'}`}>
                    {singlePreview.diffVal >= 0 ? `+${formatMoney(singlePreview.diffVal)}` : formatMoney(singlePreview.diffVal)} ({singlePreview.diffPct >= 0 ? '+' : ''}{singlePreview.diffPct.toFixed(1)}%)
                  </b>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Nova Margem:</span>
                  <b className={`tabular-nums ${singlePreview.belowCost ? 'text-red-500' : 'text-emerald-600'}`}>
                    {singlePreview.marginPct.toFixed(1)}%
                  </b>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Posição Indep.:</span>
                  <b className="tabular-nums">
                    {singlePreview.diffProfferPct !== null
                      ? `${singlePreview.diffProfferPct > 0 ? '+' : ''}${singlePreview.diffProfferPct.toFixed(1)}% (${singlePreview.projectedAction === 'MANTER' ? 'Na Média ✓' : singlePreview.projectedAction})`
                      : 'Sem Proffer'}
                  </b>
                </div>
                {editingItem.vendas_30d > 0 && (
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500">Impacto Mensal ({editingItem.vendas_30d} un):</span>
                    <b className={`tabular-nums ${singlePreview.impactoMensal >= 0 ? 'text-emerald-600' : 'text-sky-600'}`}>
                      {singlePreview.impactoMensal >= 0 ? `+${formatMoney(singlePreview.impactoMensal)}` : formatMoney(singlePreview.impactoMensal)}/mês
                    </b>
                  </div>
                )}
              </div>
            </div>

            {singlePreview.belowCost && (
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Atenção: este preço está abaixo do custo unitário ({formatMoney(editingItem.custo_efetivo)}).</span>
              </div>
            )}

            <div>
              <label className="text-[11px] font-black uppercase text-slate-500 block mb-1">Motivo do Reajuste</label>
              <input
                type="text"
                value={motivoInput}
                onChange={(e) => setMotivoInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Rodapé sequencial */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => navigateQueue(-1)}
                  disabled={applyingSingle || editingIndex <= 0}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold cursor-pointer disabled:opacity-40"
                >
                  ← Anterior
                </button>
                <button
                  type="button"
                  onClick={() => navigateQueue(1)}
                  disabled={applyingSingle || editingIndex >= items.length - 1}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold cursor-pointer disabled:opacity-40"
                >
                  Pular →
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleKeepAndNext}
                  disabled={applyingSingle}
                  className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Manter & Próximo</span>
                </button>
                <button
                  type="submit"
                  onClick={() => { submitNextRef.current = false; }}
                  disabled={applyingSingle || singlePreview.finalPrice <= 0}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  Aplicar
                </button>
                <button
                  type="submit"
                  onClick={() => { submitNextRef.current = true; }}
                  disabled={applyingSingle || singlePreview.finalPrice <= 0}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{applyingSingle ? 'Aplicando...' : editingIndex < items.length - 1 ? 'Aplicar & Próximo' : 'Aplicar & Concluir'}</span>
                  {editingIndex < items.length - 1 && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </form>
        )}
      </dialog>

      {/* MODAL 2 — REAJUSTE EM LOTE (<dialog> nativo) */}
      <dialog
        ref={batchDialogRef}
        aria-labelledby="lp-batch-title"
        onClose={(e) => { e.currentTarget.returnValue = ''; }}
        className="lp-dialog m-auto w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl p-0 overflow-hidden"
      >
        <form onSubmit={handleApplyBatchPrice} className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="lp-batch-title" className="text-base font-black">
                Reajustar {selectedIds.length} Produtos no Digifarma
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Todos os preços aplicados geram snapshot de backup para rollback em Gestão de Preços.
              </p>
            </div>
            <button
              type="button"
              onClick={() => batchDialogRef.current?.close()}
              aria-label="Fechar janela"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase text-slate-500 block">Estratégia de Preço</label>
            <select
              value={batchStrategy}
              onChange={(e) => setBatchStrategy(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
            >
              <option value="proffer_medio">Igualar Média Regional Proffer</option>
              <option value="proffer_menos_10">Aplicar Média Proffer -10%</option>
              <option value="proffer_baixo">Igualar Mínimo Regional Proffer</option>
              <option value="markup_loja">Aplicar Markup Padrão BelaFarma</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={respeitarPisoCusto}
              onChange={(e) => setRespeitarPisoCusto(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Proteger piso de custo (ignorar se novo preço &lt; CMV)</span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              autoFocus
              onClick={() => batchDialogRef.current?.close()}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={applyingBatch}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black cursor-pointer disabled:opacity-50"
            >
              {applyingBatch ? 'Aplicando...' : 'Confirmar Reajuste em Lote'}
            </button>
          </div>
        </form>
      </dialog>

      {/* MODAL 3 — IMPORTAR PLANILHA PROFFER (<dialog> nativo) */}
      <dialog
        ref={importDialogRef}
        aria-labelledby="lp-import-title"
        onClose={(e) => { e.currentTarget.returnValue = ''; }}
        className="lp-dialog m-auto w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl p-0 overflow-hidden"
      >
        <form onSubmit={handleConfirmImport} className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="lp-import-title" className="text-base font-black">
                Importar Planilha de Preços Proffer (.xlsx / .csv)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cruza por EAN/Código de Barras e atualiza os comparativos Proffer no banco local.
              </p>
            </div>
            <button
              type="button"
              onClick={() => importDialogRef.current?.close()}
              aria-label="Fechar janela"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
            />
            {importFileName && (
              <p className="text-[11px] text-slate-500 mt-1">
                Arquivo: <b>{importFileName}</b> • {importRawRows.length} linhas lidas • <b>{mappedImportItems.length}</b> itens válidos para importação
              </p>
            )}
          </div>

          {importHeaders.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Coluna EAN *</label>
                  <select value={colEan} onChange={(e) => setColEan(e.target.value)} className="w-full px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold">
                    <option value="">Selecione...</option>
                    {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Coluna Médio *</label>
                  <select value={colMedio} onChange={(e) => setColMedio(e.target.value)} className="w-full px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold">
                    <option value="">Selecione...</option>
                    {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Coluna Baixo</label>
                  <select value={colBaixo} onChange={(e) => setColBaixo(e.target.value)} className="w-full px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold">
                    <option value="">(Usar Médio)</option>
                    {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Coluna Alto</label>
                  <select value={colAlto} onChange={(e) => setColAlto(e.target.value)} className="w-full px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold">
                    <option value="">(Usar Médio)</option>
                    {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              {mappedImportItems.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] uppercase text-slate-400">
                      <tr>
                        <th className="px-3 py-2">EAN</th>
                        <th className="px-3 py-2 text-right">Baixo</th>
                        <th className="px-3 py-2 text-right">Médio</th>
                        <th className="px-3 py-2 text-right">Alto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {mappedImportItems.slice(0, 5).map((row, idx) => (
                        <tr key={`${row.ean}_${idx}`}>
                          <td className="px-3 py-1.5 font-mono">{row.ean}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(row.baixo ?? row.medio)}</td>
                          <td className="px-3 py-1.5 text-right font-bold tabular-nums">{formatMoney(row.medio)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(row.alto ?? row.medio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => importDialogRef.current?.close()}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={importingProffer || mappedImportItems.length === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black cursor-pointer disabled:opacity-50"
            >
              {importingProffer ? 'Importando...' : `Importar ${mappedImportItems.length} Preços`}
            </button>
          </div>
        </form>
      </dialog>

      {/* MODAL 4 — NOVO LEVANTAMENTO (<dialog> nativo) */}
      <dialog
        ref={newSessionDialogRef}
        aria-labelledby="lp-new-session-title"
        onClose={(e) => { e.currentTarget.returnValue = ''; }}
        className="lp-dialog m-auto w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl p-0 overflow-hidden"
      >
        <form onSubmit={handleCreateSession} className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="lp-new-session-title" className="text-base font-black">
                Criar Novo Levantamento
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Inicia uma nova sessão independente de conferência e comparativo Proffer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => newSessionDialogRef.current?.close()}
              aria-label="Fechar janela"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="text-[11px] font-black uppercase text-slate-500 block mb-1">Título do Levantamento</label>
            <input
              type="text"
              autoFocus
              placeholder="Ex: Levantamento Novembro — Geral"
              value={newSessionTitle}
              onChange={(e) => setNewSessionTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="text-[11px] font-black uppercase text-slate-500 block mb-1">Critério de Produtos</label>
            <select
              value={newSessionScope}
              onChange={(e) => setNewSessionScope(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
            >
              <option value="ativos_movimentacao">Ativos com Saldo ≠ 0 ou Movimentação (~4.036)</option>
              <option value="saldo_nao_zero">Somente Saldo Positivo ou Negativo (≠ 0)</option>
              <option value="saldo_positivo">Somente Saldo Positivo (&gt; 0)</option>
              <option value="saldo_negativo">Somente Saldo Negativo (&lt; 0)</option>
              <option value="somente_movimentacao">Somente Com Vendas ou Entradas</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => newSessionDialogRef.current?.close()}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creatingSession}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black cursor-pointer disabled:opacity-50"
            >
              {creatingSession ? 'Criando...' : 'Criar Levantamento'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
