import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';

export interface PesquisaPortalStatus {
  status: 'aguardando' | 'buscando' | 'concluido' | 'erro' | 'cancelado';
  count: number;
  duracaoMs: number;
  erro: string | null;
}

export interface PesquisaOfertaItem {
  portal: string;
  ean: string;
  eanChave: string;
  descricao: string;
  laboratorio: string;
  preco: number;
  precoSemSt: number;
  estoque: string;
  validade: string | null;
  url: string | null;
}

export interface DigifarmaInfoItem {
  cadastradoNaLoja: boolean;
  eanLoja: string;
  produtoLoja: string;
  est: number;
  v30: number;
  v90: number;
  giroMensal: number;
  cmv: number;
  ult: number;
  refCost: number;
  prVenda: number;
}

export interface PesquisaLivrePayload {
  id: string;
  termo: string;
  status: 'em_andamento' | 'concluida' | 'cancelada' | 'erro';
  criadoEm: string;
  atualizadoEm: string;
  usuario: string;
  portaisStatus: Record<string, PesquisaPortalStatus>;
  resultadosPorPortal: Record<string, PesquisaOfertaItem[]>;
  digifarmaPorEan: Record<string, DigifarmaInfoItem>;
}

export interface PesquisaHistoricoResumo {
  id: string;
  termo: string;
  status: 'em_andamento' | 'concluida' | 'cancelada' | 'erro';
  criadoEm: string;
  atualizadoEm: string;
  usuario: string;
  portaisStatus: Record<string, PesquisaPortalStatus>;
  totalOfertas: number;
}

export interface PesquisaSelecaoItem {
  sessaoId?: string;
  eanChave: string;
  ean: string;
  portal: string;
  descricao: string;
  laboratorio: string;
  preco: number;
  precoSemSt: number;
  refCost: number;
  qtd: number;
  termoOrigem: string;
  atualizadoEm?: string;
}

interface Props {
  pesquisaAtual: PesquisaLivrePayload | null;
  historico: PesquisaHistoricoResumo[];
  selecoes: Record<string, PesquisaSelecaoItem>;
  approvedFaltasEanKeys: Set<string>;
  iniciandoBusca: boolean;
  onIniciarPesquisa: (termo: string) => void;
  onCancelarPesquisa: (id: string) => void;
  onSelecionarHistorico: (id: string) => void;
  onToggleSelecao: (item: PesquisaOfertaItem, refCost: number, termoOrigem: string) => void;
  onChangeQtdSelecao: (eanChave: string, qtd: number) => void;
  onRemoverSelecao: (eanChave: string) => void;
  onLimparSelecoes: () => void;
}

type FilterMode = 'TODOS' | 'MAIS_BARATO' | 'MULTI_DIST' | 'NA_LOJA' | 'SELECIONADOS';
type SortMode = 'MELHOR_AQUI' | 'MENOR_PRECO' | 'MAIOR_GIRO' | 'NOME_AZ';

interface ComparisonTag {
  kind: 'sem_ean' | 'exclusivo' | 'mais_barato' | 'empate' | 'mais_caro';
  bestPortal: string;
  bestPreco: number;
  bestEanChave: string;
  diffPct: number;
  diffAbs: number;
  distCount: number;
  secondBest?: { portal: string; preco: number } | null;
}

const PORTAIS_ORDEM = ['Oriente', 'Distrimed', 'MG Med', 'Divimed', 'Profarma', 'Orgafarma', 'DPC', 'Soton'];
const SUGESTOES_RAPIDAS = ['desodorante aerosol', 'hidratante corporal', 'adoçante', 'protetor solar'];

const fmtBRL = (val: number) =>
  Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function normalizeEanChaveFront(ean: string): string {
  const dig = String(ean || '').replace(/\D/g, '');
  if (dig.length < 7 || dig.length > 14) return '';
  return dig.replace(/^0+/, '') || dig;
}

export const TriagemPesquisaLivreTab: React.FC<Props> = ({
  pesquisaAtual,
  historico,
  selecoes,
  approvedFaltasEanKeys,
  iniciandoBusca,
  onIniciarPesquisa,
  onCancelarPesquisa,
  onSelecionarHistorico,
  onToggleSelecao,
  onChangeQtdSelecao,
  onRemoverSelecao,
  onLimparSelecoes,
}) => {
  const [termoInput, setTermoInput] = useState('');
  const [localFilter, setLocalFilter] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('TODOS');
  const [sortMode, setSortMode] = useState<SortMode>('MELHOR_AQUI');
  const [openPortals, setOpenPortals] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PORTAIS_ORDEM.map((p) => [p, true]))
  );
  const [flashRowKey, setFlashRowKey] = useState<string>('');
  const flashTimerRef = useRef<number | null>(null);

  const emAndamento = pesquisaAtual?.status === 'em_andamento';

  const progressSummary = useMemo(() => {
    const statusMap = pesquisaAtual?.portaisStatus || {};
    let finalizados = 0;
    let buscando = 0;
    let totalOfertas = 0;

    for (const p of PORTAIS_ORDEM) {
      const st = statusMap[p];
      if (!st) continue;
      if (st.status === 'concluido' || st.status === 'erro' || st.status === 'cancelado') {
        finalizados += 1;
      } else if (st.status === 'buscando') {
        buscando += 1;
      }
      totalOfertas += Number(st.count || 0);
    }
    return { finalizados, buscando, total: PORTAIS_ORDEM.length, totalOfertas };
  }, [pesquisaAtual]);

  // Mapa consolidado por EAN exato entre todas as distribuidoras
  const consolidation = useMemo(() => {
    const eanMap = new Map<string, PesquisaOfertaItem[]>();
    const results = pesquisaAtual?.resultadosPorPortal || {};

    for (const portal of PORTAIS_ORDEM) {
      const list = Array.isArray(results[portal]) ? results[portal] : [];
      for (const item of list) {
        if (!item.eanChave) continue;
        const arr = eanMap.get(item.eanChave) || [];
        arr.push(item);
        eanMap.set(item.eanChave, arr);
      }
    }

    for (const arr of eanMap.values()) {
      arr.sort((a, b) => a.preco - b.preco || a.portal.localeCompare(b.portal));
    }

    let repetidosCount = 0;
    for (const arr of eanMap.values()) {
      if (new Set(arr.map((x) => x.portal)).size >= 2) repetidosCount += 1;
    }

    return { eanMap, uniqueEans: eanMap.size, repetidosCount };
  }, [pesquisaAtual]);

  const getComparisonTag = useMemo(() => {
    return (item: PesquisaOfertaItem): ComparisonTag => {
      if (!item.eanChave) {
        return {
          kind: 'sem_ean',
          bestPortal: item.portal,
          bestPreco: item.preco,
          bestEanChave: '',
          diffPct: 0,
          diffAbs: 0,
          distCount: 1,
        };
      }
      const group = consolidation.eanMap.get(item.eanChave) || [item];
      const distCount = new Set(group.map((g) => g.portal)).size;
      const best = group[0];

      if (distCount <= 1) {
        return {
          kind: 'exclusivo',
          bestPortal: best.portal,
          bestPreco: best.preco,
          bestEanChave: item.eanChave,
          diffPct: 0,
          diffAbs: 0,
          distCount: 1,
        };
      }

      const second = group.find((g) => g.portal !== best.portal) || null;
      const isWinner = item.preco <= best.preco + 0.004;

      if (isWinner) {
        const tiedWinner = group.some(
          (g) => g.portal !== item.portal && g.preco <= best.preco + 0.004
        );
        return {
          kind: tiedWinner ? 'empate' : 'mais_barato',
          bestPortal: best.portal,
          bestPreco: best.preco,
          bestEanChave: item.eanChave,
          diffPct: 0,
          diffAbs: 0,
          distCount,
          secondBest: second ? { portal: second.portal, preco: second.preco } : null,
        };
      }

      const diffAbs = item.preco - best.preco;
      const diffPct = best.preco > 0 ? Math.round((diffAbs / item.preco) * 100) : 0;

      return {
        kind: 'mais_caro',
        bestPortal: best.portal,
        bestPreco: best.preco,
        bestEanChave: item.eanChave,
        diffPct,
        diffAbs,
        distCount,
      };
    };
  }, [consolidation]);

  const portalGroups = useMemo(() => {
    if (!pesquisaAtual) return [];
    const digiMap = pesquisaAtual.digifarmaPorEan || {};
    const q = localFilter.trim().toLowerCase();

    return PORTAIS_ORDEM.map((portal) => {
      const st = pesquisaAtual.portaisStatus?.[portal] || {
        status: 'aguardando' as const,
        count: 0,
        duracaoMs: 0,
        erro: null,
      };
      const rawList = Array.isArray(pesquisaAtual.resultadosPorPortal?.[portal])
        ? pesquisaAtual.resultadosPorPortal[portal]
        : [];

      const enriched = rawList.map((item) => {
        const tag = getComparisonTag(item);
        const digi = item.eanChave ? digiMap[item.eanChave] || null : null;
        const selectionKey = item.eanChave || `noean::${portal}::${item.descricao.slice(0, 40)}`;
        const sel = selecoes[selectionKey] || null;
        const selectedHere = Boolean(sel && sel.portal === portal);
        const selectedElsewhere = Boolean(sel && sel.portal !== portal ? sel.portal : '');
        const inFaltasApproved = Boolean(
          item.eanChave && approvedFaltasEanKeys.has(item.eanChave)
        );
        return {
          item,
          tag,
          digi,
          selectionKey,
          sel,
          selectedHere,
          selectedElsewherePortal: sel && sel.portal !== portal ? sel.portal : '',
          inFaltasApproved,
        };
      });

      const filtered = enriched.filter((row) => {
        if (filterMode === 'MAIS_BARATO' && row.tag.kind !== 'mais_barato' && row.tag.kind !== 'empate') {
          return false;
        }
        if (filterMode === 'MULTI_DIST' && row.tag.distCount < 2) return false;
        if (filterMode === 'NA_LOJA' && !row.digi?.cadastradoNaLoja) return false;
        if (filterMode === 'SELECIONADOS' && !row.selectedHere) return false;

        if (q) {
          const hay = `${row.item.descricao} ${row.item.ean} ${row.item.laboratorio} ${
            row.digi?.produtoLoja || ''
          }`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      filtered.sort((a, b) => {
        if (sortMode === 'MELHOR_AQUI') {
          const rank = (k: ComparisonTag['kind']) =>
            k === 'mais_barato' ? 0 : k === 'empate' ? 1 : k === 'exclusivo' ? 2 : k === 'mais_caro' ? 3 : 4;
          const rDiff = rank(a.tag.kind) - rank(b.tag.kind);
          if (rDiff !== 0) return rDiff;
          return a.item.preco - b.item.preco;
        }
        if (sortMode === 'MAIOR_GIRO') {
          const ga = a.digi?.giroMensal || 0;
          const gb = b.digi?.giroMensal || 0;
          if (gb !== ga) return gb - ga;
          return a.item.preco - b.item.preco;
        }
        if (sortMode === 'NOME_AZ') {
          return a.item.descricao.localeCompare(b.item.descricao);
        }
        return a.item.preco - b.item.preco;
      });

      const winnersHere = enriched.filter(
        (r) => r.tag.kind === 'mais_barato' || r.tag.kind === 'empate'
      ).length;
      const selectedHereCount = enriched.filter((r) => r.selectedHere).length;

      return {
        portal,
        status: st,
        totalRaw: enriched.length,
        winnersHere,
        selectedHereCount,
        rows: filtered,
      };
    });
  }, [
    approvedFaltasEanKeys,
    filterMode,
    getComparisonTag,
    localFilter,
    pesquisaAtual,
    selecoes,
    sortMode,
  ]);

  const visiblePortals = portalGroups.filter(
    (g) => g.totalRaw > 0 || g.status.status === 'buscando' || g.status.status === 'erro'
  );
  const allOpen =
    visiblePortals.length > 0 && visiblePortals.every((g) => openPortals[g.portal] !== false);

  const toggleAllGroups = () => {
    const nextOpen = !allOpen;
    setOpenPortals(Object.fromEntries(PORTAIS_ORDEM.map((p) => [p, nextOpen])));
  };

  const jumpToCheaperOffer = (targetPortal: string, eanChave: string) => {
    if (!targetPortal || !eanChave) return;
    setOpenPortals((prev) => ({ ...prev, [targetPortal]: true }));
    if (filterMode === 'SELECIONADOS' || filterMode === 'MAIS_BARATO') {
      // MAIS_BARATO mantém vencedora visível; se estiver em SELECIONADOS, abre TODOS para não esconder
      if (filterMode === 'SELECIONADOS') setFilterMode('TODOS');
    }

    const rowKey = `${targetPortal}::${eanChave}`;
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const el = document.querySelector(
          `tr[data-pesquisa-row="${CSS.escape(rowKey)}"]`
        ) as HTMLElement | null;
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setFlashRowKey(rowKey);
          if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
          flashTimerRef.current = window.setTimeout(() => setFlashRowKey(''), 2400);
        }
      }, 60);
    });
  };

  const jumpToPortalGroup = (portal: string) => {
    setOpenPortals((prev) => ({ ...prev, [portal]: true }));
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`pesquisa-grupo-${portal.replace(/\s+/g, '-')}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = termoInput.trim();
    if (t.length < 2) return;
    onIniciarPesquisa(t);
  };

  const selecoesList = useMemo(
    () =>
      Object.values(selecoes).sort(
        (a, b) => a.portal.localeCompare(b.portal) || a.descricao.localeCompare(b.descricao)
      ),
    [selecoes]
  );

  const totalSelecoesValor = useMemo(
    () => selecoesList.reduce((acc, s) => acc + s.preco * s.qtd, 0),
    [selecoesList]
  );

  return (
    <div className="space-y-4">
      {/* Formulário de Pesquisa Livre + Histórico */}
      <section
        aria-label="Pesquisa abrangente nas distribuidoras"
        className="bg-[var(--bf-card-bg)] border border-[var(--bf-card-border)] rounded-xl p-4 space-y-3 shadow-sm"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-red-600 dark:text-red-400" />
              Pesquisa Livre por Termo Genérico ou Categoria
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Pesquisa simultaneamente nas 8 distribuidoras (Oriente, Distrimed, MG Med, Divimed, Profarma, Orgafarma, DPC e Soton) em segundo plano e compara preços por EAN exato.
            </p>
          </div>
          {pesquisaAtual && (
            <button
              type="button"
              disabled={iniciandoBusca || emAndamento}
              onClick={() => onIniciarPesquisa(pesquisaAtual.termo)}
              className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-45"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refazer "{pesquisaAtual.termo}" ao vivo
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Termo genérico para cotar nas 8 distribuidoras"
              value={termoInput}
              onChange={(e) => setTermoInput(e.target.value)}
              placeholder="Ex: desodorante aerosol, hidratante corporal, adoçante, protetor solar..."
              className="h-10 w-full pl-9 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={iniciandoBusca || termoInput.trim().length < 2}
            className="h-10 inline-flex items-center justify-center gap-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer disabled:opacity-45 whitespace-nowrap"
          >
            {iniciandoBusca ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Pesquisar nas 8 Distribuidoras
          </button>

          {emAndamento && pesquisaAtual && (
            <button
              type="button"
              onClick={() => onCancelarPesquisa(pesquisaAtual.id)}
              className="h-10 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Square className="w-3.5 h-3.5" />
              Parar
            </button>
          )}
        </form>

        {/* Sugestões rápidas + Histórico recente */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
          {historico.length > 0 ? (
            <>
              <span className="text-slate-500 dark:text-slate-400 font-semibold mr-1">Pesquisas recentes:</span>
              {historico.map((h) => {
                const active = pesquisaAtual?.id === h.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => onSelecionarHistorico(h.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium cursor-pointer transition-colors ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 font-bold'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {h.status === 'em_andamento' && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>{h.termo}</span>
                    <span className={active ? 'text-blue-100' : 'text-slate-400'}>({h.totalOfertas})</span>
                  </button>
                );
              })}
            </>
          ) : (
            <>
              <span className="text-slate-500 dark:text-slate-400 font-semibold mr-1">Exemplos:</span>
              {SUGESTOES_RAPIDAS.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => {
                    setTermoInput(sug);
                    onIniciarPesquisa(sug);
                  }}
                  className="px-2.5 py-1 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium cursor-pointer"
                >
                  {sug}
                </button>
              ))}
            </>
          )}
        </div>
      </section>

      {/* Progresso em Segundo Plano */}
      {pesquisaAtual && (
        <section
          aria-label="Progresso da pesquisa por distribuidora"
          className="bg-[var(--bf-card-bg)] border border-[var(--bf-card-border)] rounded-xl p-4 space-y-3 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div role="status" aria-live="polite" className="text-xs font-semibold flex items-center gap-2">
              {emAndamento ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>
                    Buscando "{pesquisaAtual.termo}" em segundo plano: {progressSummary.finalizados} de{' '}
                    {progressSummary.total} distribuidoras concluídas · {progressSummary.totalOfertas} ofertas até agora
                  </span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Cotação "{pesquisaAtual.termo}" ({pesquisaAtual.status}): {progressSummary.totalOfertas} ofertas ·{' '}
                    {consolidation.uniqueEans} EANs únicos · {consolidation.repetidosCount} produto(s) em 2 ou mais distribuidoras
                  </span>
                </>
              )}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {progressSummary.finalizados}/{progressSummary.total} dists
            </span>
          </div>

          <progress
            className="triagem-progress"
            max={progressSummary.total}
            value={progressSummary.finalizados}
            aria-label={`Progresso da pesquisa ${pesquisaAtual.termo}`}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {PORTAIS_ORDEM.map((portal) => {
              const st = pesquisaAtual.portaisStatus?.[portal] || {
                status: 'aguardando',
                count: 0,
                duracaoMs: 0,
                erro: null,
              };
              const clickable = st.status === 'concluido' && st.count > 0;
              return (
                <button
                  key={portal}
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && jumpToPortalGroup(portal)}
                  title={st.erro || `${portal}: ${st.count} itens (${Math.round((st.duracaoMs || 0) / 1000)}s)`}
                  className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs text-left transition-colors ${
                    st.status === 'concluido'
                      ? st.count > 0
                        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 cursor-pointer hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 opacity-75 cursor-default'
                      : st.status === 'buscando'
                      ? 'border-blue-300 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 cursor-default'
                      : st.status === 'erro'
                      ? 'border-red-300 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30 cursor-default'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 opacity-65 cursor-default'
                  }`}
                >
                  <span className="font-semibold truncate">{portal}</span>
                  <span className="inline-flex items-center gap-1 shrink-0 tabular-nums font-bold">
                    {st.status === 'buscando' && <Loader2 className="w-3 h-3 animate-spin text-blue-600" />}
                    {st.status === 'aguardando' && <Clock className="w-3 h-3 text-slate-400" />}
                    {st.status === 'erro' && <AlertCircle className="w-3 h-3 text-red-500" />}
                    {st.status === 'concluido' && (
                      <span className={st.count > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}>
                        {st.count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Resumo dos itens selecionados acumulados entre pesquisas */}
      {selecoesList.length > 0 && (
        <section
          aria-label="Itens da Pesquisa Livre adicionados aos carrinhos"
          className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3.5 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
              <PackageCheck className="w-4 h-4" />
              <span>
                {selecoesList.length} item(ns) selecionados na Pesquisa Livre · Total {fmtBRL(totalSelecoesValor)} (já somados nos cards das distribuidoras no topo)
              </span>
            </div>
            <button
              type="button"
              onClick={onLimparSelecoes}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-red-700 dark:text-red-300 text-xs font-semibold cursor-pointer hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3" />
              Limpar seleção da pesquisa
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selecoesList.map((s) => (
              <div
                key={s.eanChave}
                className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-xs shadow-2xs"
              >
                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 font-bold text-[11px]">
                  {s.portal}
                </span>
                <span className="font-medium max-w-[220px] truncate" title={s.descricao}>
                  {s.descricao}
                </span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  aria-label={`Quantidade de ${s.descricao}`}
                  value={s.qtd}
                  onChange={(e) => onChangeQtdSelecao(s.eanChave, Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-12 h-6 px-1 text-right rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 tabular-nums font-bold text-xs"
                />
                <span className="tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                  {fmtBRL(s.preco * s.qtd)}
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${s.descricao}`}
                  onClick={() => onRemoverSelecao(s.eanChave)}
                  className="text-slate-400 hover:text-red-600 cursor-pointer"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filtros dos Resultados da Pesquisa */}
      {pesquisaAtual && (
        <section
          aria-label="Filtros dos resultados da pesquisa"
          className="bg-[var(--bf-card-bg)] border border-[var(--bf-card-border)] rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['TODOS', 'Todas as ofertas'],
                ['MAIS_BARATO', '★ Mais barato aqui'],
                ['MULTI_DIST', `Em 2+ dists (${consolidation.repetidosCount})`],
                ['NA_LOJA', 'Já cadastrados na loja'],
                ['SELECIONADOS', `Selecionados (${selecoesList.length})`],
              ] as Array<[FilterMode, string]>
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                  filterMode === mode
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Filtrar dentro dos resultados encontrados"
                value={localFilter}
                onChange={(e) => setLocalFilter(e.target.value)}
                placeholder="Refinar marca, ml, lab ou EAN..."
                className="h-8 w-56 pl-8 pr-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <select
              aria-label="Ordenação dentro de cada distribuidora"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="h-8 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
            >
              <option value="MELHOR_AQUI">Mais baratos aqui no topo</option>
              <option value="MENOR_PRECO">Menor preço primeiro</option>
              <option value="MAIOR_GIRO">Maior giro na loja</option>
              <option value="NOME_AZ">Ordem alfabética (A-Z)</option>
            </select>

            <button
              type="button"
              aria-expanded={allOpen}
              onClick={toggleAllGroups}
              className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {allOpen ? 'Recolher todos' : 'Expandir todos'}
            </button>
          </div>
        </section>
      )}

      {/* Grupos organizados por Distribuidora */}
      {!pesquisaAtual ? (
        <div className="bg-[var(--bf-card-bg)] border border-[var(--bf-card-border)] rounded-xl p-8 text-center text-xs text-slate-500 dark:text-slate-400">
          Digite um nome genérico acima (ex.: <strong>desodorante aerosol</strong>, <strong>hidratante corporal</strong> ou{' '}
          <strong>adoçante</strong>) para consultar todas as 8 distribuidoras e comparar onde cada produto está mais barato.
        </div>
      ) : (
        <section aria-label="Resultados agrupados por distribuidora" className="space-y-3">
          {visiblePortals.map((group) => {
            const isOpen = openPortals[group.portal] !== false;
            return (
              <details
                key={group.portal}
                id={`pesquisa-grupo-${group.portal.replace(/\s+/g, '-')}`}
                open={isOpen}
                onToggle={(e) => {
                  const opened = (e.currentTarget as HTMLDetailsElement).open;
                  setOpenPortals((prev) => ({ ...prev, [group.portal]: opened }));
                }}
                className="triagem-dist-group bg-[var(--bf-card-bg)] border border-[var(--bf-card-border)] rounded-xl shadow-sm"
              >
                <summary className="px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-2 select-none">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm">{group.portal}</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold tabular-nums">
                      {group.rows.length}
                      {group.rows.length !== group.totalRaw ? ` de ${group.totalRaw}` : ''} ofertas
                    </span>
                    {group.winnersHere > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-bold tabular-nums">
                        ★ {group.winnersHere} mais barato(s) aqui
                      </span>
                    )}
                    {group.selectedHereCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-bold tabular-nums">
                        {group.selectedHereCount} no carrinho
                      </span>
                    )}
                    {group.status.status === 'buscando' && (
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Consultando...
                      </span>
                    )}
                    {group.status.status === 'erro' && (
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        Falha: {group.status.erro}
                      </span>
                    )}
                  </div>
                  <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                    {group.status.duracaoMs > 0 ? `${(group.status.duracaoMs / 1000).toFixed(1)}s` : ''}
                  </span>
                </summary>

                <div className="border-t border-[var(--bf-card-border)]">
                  {group.rows.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
                      {group.status.status === 'buscando'
                        ? 'Aguardando resposta desta distribuidora...'
                        : group.status.status === 'erro'
                        ? `Não foi possível consultar ${group.portal}: ${group.status.erro}`
                        : 'Nenhum item deste grupo corresponde aos filtros aplicados.'}
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[430px] overflow-y-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 border-b border-[var(--bf-card-border)]">
                          <tr>
                            <th className="py-2 px-3 text-left whitespace-nowrap w-24">Comprar</th>
                            <th className="py-2 px-3 text-left whitespace-nowrap">Produto</th>
                            <th className="py-2 px-3 text-right whitespace-nowrap w-40">Loja (Digifarma)</th>
                            <th className="py-2 px-3 text-right whitespace-nowrap w-32">Preço NF</th>
                            <th className="py-2 px-3 text-left whitespace-nowrap w-64">Onde é mais barato</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => {
                            const { item, tag, digi, selectedHere, selectedElsewherePortal, inFaltasApproved, sel } =
                              row;
                            const rowKey = `${group.portal}::${item.eanChave || item.descricao}`;
                            const isFlashing = flashRowKey === rowKey;
                            const refCost = digi?.refCost || 0;
                            const varPct =
                              refCost > 0 ? Math.round(((item.preco - refCost) / refCost) * 100) : null;

                            return (
                              <tr
                                key={rowKey}
                                data-pesquisa-row={rowKey}
                                className={`border-b border-slate-200/70 dark:border-slate-800 transition-colors ${
                                  isFlashing
                                    ? 'triagem-row-flash'
                                    : selectedHere
                                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                                }`}
                              >
                                <td className="py-2 px-3 align-top">
                                  <div className="inline-flex items-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      aria-label={`Selecionar ${item.descricao} na ${group.portal}`}
                                      checked={selectedHere}
                                      disabled={inFaltasApproved}
                                      onChange={() =>
                                        onToggleSelecao(item, refCost, pesquisaAtual.termo)
                                      }
                                      className="w-4 h-4 accent-emerald-600 cursor-pointer disabled:opacity-40"
                                    />
                                    {selectedHere && sel && (
                                      <input
                                        type="number"
                                        min={1}
                                        max={999}
                                        aria-label={`Quantidade de ${item.descricao}`}
                                        value={sel.qtd}
                                        onChange={(e) =>
                                          onChangeQtdSelecao(
                                            row.selectionKey,
                                            Math.max(1, parseInt(e.target.value, 10) || 1)
                                          )
                                        }
                                        className="w-12 h-7 px-1 text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 tabular-nums font-bold text-xs"
                                      />
                                    )}
                                  </div>
                                  {inFaltasApproved && (
                                    <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                                      Na aba Faltas
                                    </div>
                                  )}
                                  {selectedElsewherePortal && !inFaltasApproved && (
                                    <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                                      Sel. {selectedElsewherePortal}
                                    </div>
                                  )}
                                </td>

                                <td className="py-2 px-3 align-top">
                                  <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                                    {item.descricao}
                                  </div>
                                  <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    <span className="font-mono">{item.ean || 'Sem EAN'}</span>
                                    {item.laboratorio && <span>· {item.laboratorio}</span>}
                                    {item.validade && <span>· Val {item.validade}</span>}
                                    {digi?.cadastradoNaLoja ? (
                                      <span className="px-1.5 py-0 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-semibold">
                                        Na loja
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0 rounded bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                        Novo p/ loja
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="py-2 px-3 align-top text-right tabular-nums">
                                  {digi?.cadastradoNaLoja ? (
                                    <div>
                                      <div className="font-semibold">
                                        Est {digi.est} · Giro {digi.giroMensal}/mês
                                      </div>
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                        {refCost > 0 ? `Últ. ${fmtBRL(refCost)}` : 'Sem custo ant.'}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">Sem cadastro</span>
                                  )}
                                </td>

                                <td className="py-2 px-3 align-top text-right tabular-nums">
                                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                                    {fmtBRL(item.preco)}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {item.precoSemSt > 0 && Math.abs(item.precoSemSt - item.preco) >= 0.02
                                      ? `s/ ST ${fmtBRL(item.precoSemSt)}`
                                      : varPct !== null
                                      ? `${varPct > 0 ? '+' : ''}${varPct}% vs últ.`
                                      : ''}
                                  </div>
                                </td>

                                <td className="py-2 px-3 align-top">
                                  {tag.kind === 'mais_barato' && (
                                    <span
                                      title={
                                        tag.secondBest
                                          ? `2ª mais barata: ${tag.secondBest.portal} (${fmtBRL(tag.secondBest.preco)})`
                                          : 'Menor preço entre as distribuidoras'
                                      }
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 font-bold text-xs"
                                    >
                                      ★ Mais barato aqui
                                      {tag.secondBest && tag.secondBest.preco > item.preco && (
                                        <span className="font-medium opacity-85">
                                          · -{fmtBRL(tag.secondBest.preco - item.preco)} vs {tag.secondBest.portal}
                                        </span>
                                      )}
                                    </span>
                                  )}

                                  {tag.kind === 'empate' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 font-bold text-xs">
                                      ★ Empate no menor preço ({tag.distCount} dists)
                                    </span>
                                  )}

                                  {tag.kind === 'mais_caro' && (
                                    <button
                                      type="button"
                                      onClick={() => jumpToCheaperOffer(tag.bestPortal, tag.bestEanChave)}
                                      title={`Clique para ir até ${tag.bestPortal} (${fmtBRL(tag.bestPreco)})`}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 font-semibold text-xs cursor-pointer text-left"
                                    >
                                      Mais barato na <strong>{tag.bestPortal}</strong> · {fmtBRL(tag.bestPreco)}
                                      {tag.diffPct > 0 ? ` (-${tag.diffPct}%)` : ''}
                                    </button>
                                  )}

                                  {tag.kind === 'exclusivo' && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-medium text-xs">
                                      Exclusivo desta dist
                                    </span>
                                  )}

                                  {tag.kind === 'sem_ean' && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 font-medium text-xs">
                                      Sem EAN (não consolidado)
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </section>
      )}
    </div>
  );
};
