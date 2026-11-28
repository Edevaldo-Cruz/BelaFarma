import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Filter,
  Globe,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import { User } from '../../types';
import { useToast } from '../ToastContext';
import {
  normalizeEanChaveFront,
  PesquisaHistoricoResumo,
  PesquisaLivrePayload,
  PesquisaOfertaItem,
  PesquisaSelecaoItem,
  TriagemPesquisaLivreTab,
} from './TriagemPesquisaLivreTab';
import './TriagemFaltasPage.css';

export interface TriagemOferta {
  portal: 'Distrimed' | 'Oriente' | 'MG Med' | 'Divimed' | string;
  precoSemSt: number;
  preco: number;
  lab?: string;
  val?: string;
  linha?: string;
  estPortal?: number;
}

export interface TriagemItemRaw {
  ean: string;
  produto: string;
  apresentacao: string;
  tipo: 'MEDICAMENTO' | 'PERFUMARIA' | string;
  subtipo: string;
  c1: boolean;
  est: number;
  v30: number;
  v90: number;
  giroMensal: number;
  sug: number;
  cmv: number;
  ult: number;
  refCost: number;
  prVenda: number;
  pedidoRecente?: boolean;
  ofertas: TriagemOferta[];
}

export interface TriagemItem extends TriagemItemRaw {
  packAlert: boolean;
  cadastroAlert: boolean;
}

export interface TriagemDecisao {
  comprar: boolean;
  portalIndex: number;
  qtd: number;
  motivo: string;
  obs: string;
}

interface TriagemSessaoApi {
  id: string;
  criadoEm: string;
  atualizadoEm: string;
  portaisResumo: Record<string, number>;
  itens: TriagemItemRaw[];
}

interface RobotCartState {
  emAndamento: boolean;
  atual: number;
  total: number;
  sucessos: number;
  erros: number;
  doneMsg?: string;
}

interface Props {
  user: User;
}

const MOTIVOS_EXCLUSAO = [
  'Já comprei / pedido em trânsito',
  'Preço subiu — aguardar oferta melhor',
  'Substituto / outro laboratório em estoque',
  'Erro de estoque / produto existe na prateleira',
  'Sem estoque nas distribuidoras cotadas',
  'Embalagem/display — conferir fracionamento',
  'Baixo giro / fora de prioridade',
  'Fora do orçamento / segurar caixa',
  'Produto descontinuado / não repor',
  'Outro motivo (especificar)',
];

const PORTAL_ROBOT_ENDPOINTS: Record<string, { post: string; status: string; min: number }> = {
  Distrimed: {
    post: '/api/belaped/importar-carrinho-distrimed',
    status: '/api/belaped/status-carrinho-distrimed',
    min: 350,
  },
  Oriente: {
    post: '/api/belaped/montar-carrinho-oriente',
    status: '/api/belaped/status-carrinho-oriente',
    min: 300,
  },
  'MG Med': {
    post: '/api/belaped/montar-carrinho-mgmedicamentos',
    status: '/api/belaped/status-carrinho-mgmedicamentos',
    min: 300,
  },
  Divimed: {
    post: '/api/belaped/montar-carrinho-divimed',
    status: '/api/belaped/status-carrinho-divimed',
    min: 250,
  },
  Profarma: {
    post: '/api/belaped/montar-carrinho-profarma',
    status: '/api/belaped/status-carrinho-profarma',
    min: 150,
  },
  Soton: {
    post: '/api/belaped/montar-carrinho-soton',
    status: '/api/belaped/status-carrinho-soton',
    min: 200,
  },
  DPC: {
    post: '/api/belaped/montar-carrinho-dpc',
    status: '/api/belaped/status-carrinho-dpc',
    min: 300,
  },
  Orgafarma: {
    post: '/api/belaped/montar-carrinho-orgafarma',
    status: '/api/belaped/status-carrinho-orgafarma',
    min: 200,
  },
};

const PACK_ALERT_EANS = new Set([
  '7897848500860',
  '7896094903289',
  '7898079006701',
  '7896902211537',
  '7896111954485',
  '7898656391664',
]);

const CACHE_KEY = 'belinha_triagem_faltas_cache_v1';

const fmtBRL = (val: number) =>
  Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function enrichItem(raw: TriagemItemRaw): TriagemItem {
  const ofertas = Array.isArray(raw.ofertas) ? raw.ofertas : [];
  const best = ofertas[0];
  const packAlert =
    PACK_ALERT_EANS.has(raw.ean) ||
    Boolean(best && raw.refCost > 0.2 && best.preco > raw.refCost * 2.8);
  const cadastroAlert = Number(raw.refCost || 0) <= 0.15;
  return { ...raw, ofertas, packAlert, cadastroAlert };
}

function buildDefaultDecisions(itens: TriagemItem[]): Record<string, TriagemDecisao> {
  const out: Record<string, TriagemDecisao> = {};
  for (const it of itens) {
    if (!it.ofertas.length) {
      out[it.ean] = {
        comprar: false,
        portalIndex: 0,
        qtd: it.sug,
        motivo: 'Sem estoque nas distribuidoras cotadas',
        obs: '',
      };
    } else if (it.pedidoRecente) {
      out[it.ean] = {
        comprar: false,
        portalIndex: 0,
        qtd: it.sug,
        motivo: 'Já comprei / pedido em trânsito',
        obs: 'Incluído nos carrinhos de 24/11',
      };
    } else if (it.packAlert) {
      out[it.ean] = {
        comprar: false,
        portalIndex: 0,
        qtd: it.sug,
        motivo: 'Embalagem/display — conferir fracionamento',
        obs: 'Preço do portal é caixa/display fechado',
      };
    } else {
      out[it.ean] = {
        comprar: true,
        portalIndex: 0,
        qtd: it.sug,
        motivo: '',
        obs: '',
      };
    }
  }
  return out;
}

function attachDialogDismissFallback(dlg: HTMLDialogElement | null): () => void {
  if (!dlg) return () => {};
  const onClose = () => {
    dlg.returnValue = '';
  };
  dlg.addEventListener('close', onClose);

  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e: PointerEvent) => {
      const r = dlg.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    const onDown = (e: PointerEvent) => {
      pressedOutside = outside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && outside(e)) {
        dlg.returnValue = '';
        dlg.close();
      }
    };
    dlg.addEventListener('pointerdown', onDown);
    dlg.addEventListener('pointerup', onUp);
    return () => {
      dlg.removeEventListener('close', onClose);
      dlg.removeEventListener('pointerdown', onDown);
      dlg.removeEventListener('pointerup', onUp);
    };
  }

  return () => dlg.removeEventListener('close', onClose);
}

export const TriagemFaltasPage: React.FC<Props> = ({ user }) => {
  const { addToast } = useToast();

  const [sessaoId, setSessaoId] = useState<string>('');
  const [atualizadoEm, setAtualizadoEm] = useState<string>('');
  const [items, setItems] = useState<TriagemItem[]>([]);
  const [decisions, setDecisions] = useState<Record<string, TriagemDecisao>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingAction, setUpdatingAction] = useState<'none' | 'digifarma' | 'portais'>('none');
  const [syncInfo, setSyncInfo] = useState<string>('Carregando...');

  const [filterTipo, setFilterTipo] = useState<'TODOS' | 'MEDICAMENTO' | 'PERFUMARIA'>('TODOS');
  const [filterStatus, setFilterStatus] = useState<string>('TODOS');
  const [filterPortal, setFilterPortal] = useState<string>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [activePageTab, setActivePageTab] = useState<'faltas' | 'pesquisa'>('faltas');
  const [pesquisaAtual, setPesquisaAtual] = useState<PesquisaLivrePayload | null>(null);
  const [pesquisaHistorico, setPesquisaHistorico] = useState<PesquisaHistoricoResumo[]>([]);
  const [pesquisaSelecoes, setPesquisaSelecoes] = useState<Record<string, PesquisaSelecaoItem>>({});
  const [iniciandoBuscaLivre, setIniciandoBuscaLivre] = useState<boolean>(false);

  const [activeModalTab, setActiveModalTab] = useState<'aprovados' | 'excluidos'>('aprovados');
  const [modalInlineStatus, setModalInlineStatus] = useState<string>('');
  const [pendingCartPortal, setPendingCartPortal] = useState<string | null>(null);
  const [robotStates, setRobotStates] = useState<Record<string, RobotCartState>>({});

  const reviewDialogRef = useRef<HTMLDialogElement | null>(null);
  const cartConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const srAnnouncerRef = useRef<HTMLDivElement | null>(null);
  const obsTimersRef = useRef<Record<string, number>>({});
  const pollTimersRef = useRef<Record<string, number>>({});
  const pesquisaPollTimerRef = useRef<number | null>(null);
  const prevPesquisaStatusRef = useRef<string>('');
  const announceTimerRef = useRef<number | null>(null);
  const announcedFieldRef = useRef<Element | null>(null);
  const flaggedSetRef = useRef<WeakSet<Element>>(new WeakSet());
  const announcedSetRef = useRef<WeakSet<Element>>(new WeakSet());
  const fallbackDirtyRef = useRef<
    WeakMap<Element, { hasInteracted?: boolean; hasBlurred?: boolean; submitted?: boolean }>
  >(new WeakMap());

  const supportsUserInvalid = useMemo(() => {
    try {
      return typeof CSS !== 'undefined' && CSS.supports('selector(:user-invalid)');
    } catch {
      return false;
    }
  }, []);

  const showToastSafe = useCallback(
    (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', durationMs = 4500) => {
      if (reviewDialogRef.current?.open || cartConfirmDialogRef.current?.open) return;
      addToast(msg, type, durationMs);
    },
    [addToast]
  );

  const linkError = useCallback((el: Element, shown: boolean) => {
    const errorId = (el as HTMLElement).dataset?.error;
    if (!errorId) return;
    const ids = (el.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== errorId);
    if (shown) ids.push(errorId);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
  }, []);

  const announceError = useCallback((el: HTMLElement) => {
    const errorId = el.dataset?.error;
    if (!errorId || !srAnnouncerRef.current) return;
    const errEl = document.getElementById(errorId);
    if (!errEl) return;
    const labelText = el.getAttribute('aria-label') ? `${el.getAttribute('aria-label')}: ` : '';
    const errText = (errEl.textContent || '').replace(/\s+/g, ' ').trim();
    if (announceTimerRef.current) window.clearTimeout(announceTimerRef.current);
    srAnnouncerRef.current.textContent = '';
    announcedFieldRef.current = el;
    announceTimerRef.current = window.setTimeout(() => {
      if (srAnnouncerRef.current) {
        srAnnouncerRef.current.textContent = labelText + errText;
      }
    }, 500);
  }, []);

  const syncAria = useCallback(
    (el: Element | null, announce = false) => {
      if (!el || !el.matches?.('select, input')) return;
      const htmlEl = el as HTMLSelectElement | HTMLInputElement;
      if (!htmlEl.dataset?.error) return;

      let invalid = false;
      if (supportsUserInvalid) {
        invalid = htmlEl.matches(':user-invalid') || htmlEl.classList.contains('user-invalid-fallback');
      } else {
        const st = fallbackDirtyRef.current.get(htmlEl);
        invalid = Boolean(st && (st.hasBlurred || st.submitted) && !htmlEl.validity.valid);
        htmlEl.classList.toggle('user-invalid-fallback', invalid);
      }

      if (invalid) {
        if (announce && !announcedSetRef.current.has(htmlEl)) {
          announceError(htmlEl);
          announcedSetRef.current.add(htmlEl);
        }
        htmlEl.setAttribute('aria-invalid', 'true');
        linkError(htmlEl, true);
        flaggedSetRef.current.add(htmlEl);
      } else if (flaggedSetRef.current.has(htmlEl) || htmlEl.getAttribute('aria-invalid') !== 'true') {
        htmlEl.setAttribute('aria-invalid', 'false');
        linkError(htmlEl, false);
        flaggedSetRef.current.delete(htmlEl);
        announcedSetRef.current.delete(htmlEl);
        if (announcedFieldRef.current === htmlEl && srAnnouncerRef.current) {
          if (announceTimerRef.current) window.clearTimeout(announceTimerRef.current);
          srAnnouncerRef.current.textContent = '';
        }
      }
    },
    [announceError, linkError, supportsUserInvalid]
  );

  // Listeners no tbody para sincronizar :user-invalid / aria-invalid / aria-describedby
  useEffect(() => {
    const tbody = tbodyRef.current;
    if (!tbody) return;

    const onBlur = (e: Event) => {
      const t = e.target as HTMLElement;
      if (!t?.dataset?.error) return;
      const st = fallbackDirtyRef.current.get(t) || {};
      st.hasBlurred = true;
      fallbackDirtyRef.current.set(t, st);
      syncAria(t, true);
    };

    const onChange = (e: Event) => {
      const t = e.target as HTMLElement;
      if (!t?.dataset?.error) return;
      const st = fallbackDirtyRef.current.get(t) || {};
      st.hasInteracted = true;
      st.hasBlurred = true;
      fallbackDirtyRef.current.set(t, st);
      syncAria(t, true);
    };

    const onInput = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t?.dataset?.error && t.hasAttribute('aria-invalid')) {
        syncAria(t, false);
      }
    };

    tbody.addEventListener('blur', onBlur, true);
    tbody.addEventListener('change', onChange, true);
    tbody.addEventListener('input', onInput);
    return () => {
      tbody.removeEventListener('blur', onBlur, true);
      tbody.removeEventListener('change', onChange, true);
      tbody.removeEventListener('input', onInput);
    };
  }, [syncAria]);

  // Fallbacks das duas <dialog> nativas + limpeza de timers no unmount
  useEffect(() => {
    const clean1 = attachDialogDismissFallback(reviewDialogRef.current);
    const clean2 = attachDialogDismissFallback(cartConfirmDialogRef.current);
    return () => {
      clean1();
      clean2();
      Object.values(pollTimersRef.current).forEach((id) => window.clearInterval(id));
      Object.values(obsTimersRef.current).forEach((id) => window.clearTimeout(id));
      if (pesquisaPollTimerRef.current) window.clearInterval(pesquisaPollTimerRef.current);
    };
  }, []);

  const applyServerPayload = useCallback(
    (sessao: TriagemSessaoApi, serverDecisoes: Record<string, Partial<TriagemDecisao>>) => {
      const enriched = (sessao.itens || []).map(enrichItem);
      const defaults = buildDefaultDecisions(enriched);
      const merged: Record<string, TriagemDecisao> = { ...defaults };

      for (const it of enriched) {
        const d = serverDecisoes?.[it.ean];
        if (d) {
          const maxIdx = Math.max(0, it.ofertas.length - 1);
          merged[it.ean] = {
            comprar: it.ofertas.length > 0 ? Boolean(d.comprar) : false,
            portalIndex: Math.min(maxIdx, Math.max(0, Number(d.portalIndex) || 0)),
            qtd: Math.max(1, parseInt(String(d.qtd ?? it.sug), 10) || it.sug),
            motivo: typeof d.motivo === 'string' ? d.motivo : defaults[it.ean].motivo,
            obs: typeof d.obs === 'string' ? d.obs : defaults[it.ean].obs,
          };
        }
      }

      setSessaoId(sessao.id);
      setAtualizadoEm(sessao.atualizadoEm || sessao.criadoEm || '');
      setItems(enriched);
      setDecisions(merged);
      setSyncInfo(`Salvo no Belinha · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ sessao, decisoes: merged, savedAt: new Date().toISOString() })
        );
      } catch {}
    },
    []
  );

  useEffect(() => {
    let active = true;
    const loadInitial = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/central-compras/triagem-faltas/atual');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (active && data?.success && data.sessao) {
          applyServerPayload(data.sessao, data.decisoes || {});
          return;
        }
        throw new Error(data?.error || 'Resposta inválida');
      } catch {
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached && active) {
            const parsed = JSON.parse(cached);
            if (parsed?.sessao) {
              applyServerPayload(parsed.sessao, parsed.decisoes || {});
              setSyncInfo('Modo cache local (sem conexão com servidor)');
              return;
            }
          }
        } catch {}
        if (active) {
          setSyncInfo('Falha ao carregar lista de faltas');
          showToastSafe('Não foi possível carregar a lista de faltas do servidor.', 'error');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    loadInitial();
    return () => {
      active = false;
    };
  }, [applyServerPayload, showToastSafe]);

  // Carregamento de selecoes acumuladas e historico da Pesquisa Livre (incluindo retomada de job em andamento)
  const carregarHistoricoPesquisa = useCallback(async (autoOpenLast = false) => {
    try {
      const res = await fetch('/api/central-compras/triagem-faltas/pesquisa-livre/historico?limit=12');
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.success) return;
      const hist: PesquisaHistoricoResumo[] = Array.isArray(data.historico) ? data.historico : [];
      setPesquisaHistorico(hist);

      const targetId = data.ativaId || (autoOpenLast && hist.length > 0 ? hist[0].id : null);
      if (targetId) {
        const resP = await fetch(`/api/central-compras/triagem-faltas/pesquisa-livre/${encodeURIComponent(targetId)}`);
        if (resP.ok) {
          const dp = await resP.json();
          if (dp?.success && dp.pesquisa) {
            setPesquisaAtual(dp.pesquisa);
          }
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    carregarHistoricoPesquisa(true);
  }, [carregarHistoricoPesquisa]);

  useEffect(() => {
    if (!sessaoId) return;
    let active = true;
    fetch(`/api/central-compras/triagem-faltas/pesquisa-selecoes?sessaoId=${encodeURIComponent(sessaoId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.success || !Array.isArray(d.selecoes)) return;
        const map: Record<string, PesquisaSelecaoItem> = {};
        for (const s of d.selecoes) {
          if (s?.eanChave) map[s.eanChave] = s;
        }
        setPesquisaSelecoes(map);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessaoId]);

  useEffect(() => {
    if (pesquisaPollTimerRef.current) {
      window.clearInterval(pesquisaPollTimerRef.current);
      pesquisaPollTimerRef.current = null;
    }

    const id = pesquisaAtual?.id;
    const status = pesquisaAtual?.status || '';
    if (prevPesquisaStatusRef.current === 'em_andamento' && status && status !== 'em_andamento') {
      const total = Object.values(pesquisaAtual?.portaisStatus || {}).reduce(
        (acc, p) => acc + Number(p?.count || 0),
        0
      );
      showToastSafe(
        status === 'concluida'
          ? `Pesquisa "${pesquisaAtual?.termo}" concluída: ${total} ofertas encontradas nas distribuidoras.`
          : `Pesquisa "${pesquisaAtual?.termo}" finalizada (${status}).`,
        status === 'concluida' ? 'success' : 'info',
        5500
      );
      carregarHistoricoPesquisa(false);
    }
    prevPesquisaStatusRef.current = status;

    if (!id || status !== 'em_andamento') return;

    pesquisaPollTimerRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/central-compras/triagem-faltas/pesquisa-livre/${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const d = await res.json();
        if (d?.success && d.pesquisa) {
          setPesquisaAtual(d.pesquisa);
        }
      } catch {}
    }, 2000);

    return () => {
      if (pesquisaPollTimerRef.current) {
        window.clearInterval(pesquisaPollTimerRef.current);
        pesquisaPollTimerRef.current = null;
      }
    };
  }, [carregarHistoricoPesquisa, pesquisaAtual, showToastSafe]);

  const handleIniciarPesquisaLivre = async (termo: string) => {
    setIniciandoBuscaLivre(true);
    try {
      const res = await fetch('/api/central-compras/triagem-faltas/pesquisa-livre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termo, usuario: user?.name || 'Usuário' }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data.pesquisa) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      prevPesquisaStatusRef.current = 'em_andamento';
      setPesquisaAtual(data.pesquisa);
      carregarHistoricoPesquisa(false);
    } catch (err: any) {
      showToastSafe(`Falha ao iniciar pesquisa: ${err?.message || 'erro'}`, 'error');
    } finally {
      setIniciandoBuscaLivre(false);
    }
  };

  const handleCancelarPesquisaLivre = async (id: string) => {
    try {
      await fetch(`/api/central-compras/triagem-faltas/pesquisa-livre/${encodeURIComponent(id)}/cancelar`, {
        method: 'POST',
      });
      const res = await fetch(`/api/central-compras/triagem-faltas/pesquisa-livre/${encodeURIComponent(id)}`);
      const d = await res.json();
      if (d?.success && d.pesquisa) setPesquisaAtual(d.pesquisa);
      showToastSafe('Pesquisa interrompida; resultados já obtidos foram mantidos.', 'info');
    } catch {}
  };

  const handleSelecionarHistoricoLivre = async (id: string) => {
    try {
      const res = await fetch(`/api/central-compras/triagem-faltas/pesquisa-livre/${encodeURIComponent(id)}`);
      const d = await res.json();
      if (d?.success && d.pesquisa) {
        setPesquisaAtual(d.pesquisa);
      }
    } catch {
      showToastSafe('Não foi possível abrir esta pesquisa salva.', 'error');
    }
  };

  const handleTogglePesquisaSelecao = useCallback(
    async (item: PesquisaOfertaItem, refCost: number, termoOrigem: string) => {
      const selectionKey =
        item.eanChave || `noean::${item.portal}::${item.descricao.slice(0, 40)}`;
      const existing = pesquisaSelecoes[selectionKey];

      if (existing && existing.portal === item.portal) {
        setPesquisaSelecoes((prev) => {
          const next = { ...prev };
          delete next[selectionKey];
          return next;
        });
        fetch('/api/central-compras/triagem-faltas/pesquisa-selecoes/item', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessaoId, eanChave: selectionKey }),
        }).catch(() => {});
        return;
      }

      const payload: PesquisaSelecaoItem = {
        sessaoId: sessaoId || undefined,
        eanChave: selectionKey,
        ean: item.ean || '',
        portal: item.portal,
        descricao: item.descricao,
        laboratorio: item.laboratorio || '',
        preco: item.preco,
        precoSemSt: item.precoSemSt || item.preco,
        refCost: Number(refCost || 0),
        qtd: existing?.qtd || 1,
        termoOrigem,
      };

      setPesquisaSelecoes((prev) => ({ ...prev, [selectionKey]: payload }));
      try {
        const res = await fetch('/api/central-compras/triagem-faltas/pesquisa-selecoes/item', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, usuario: user?.name || 'Usuário' }),
        });
        const d = await res.json();
        if (d?.success && d.item) {
          setPesquisaSelecoes((prev) => ({ ...prev, [selectionKey]: d.item }));
        }
      } catch {}
    },
    [pesquisaSelecoes, sessaoId, user?.name]
  );

  const handleChangePesquisaQtd = useCallback(
    (eanChave: string, qtd: number) => {
      const current = pesquisaSelecoes[eanChave];
      if (!current) return;
      const updated = { ...current, qtd: Math.max(1, qtd || 1) };
      setPesquisaSelecoes((prev) => ({ ...prev, [eanChave]: updated }));
      fetch('/api/central-compras/triagem-faltas/pesquisa-selecoes/item', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updated, sessaoId, usuario: user?.name || 'Usuário' }),
      }).catch(() => {});
    },
    [pesquisaSelecoes, sessaoId, user?.name]
  );

  const handleRemoverPesquisaSelecao = useCallback(
    (eanChave: string) => {
      setPesquisaSelecoes((prev) => {
        const next = { ...prev };
        delete next[eanChave];
        return next;
      });
      fetch('/api/central-compras/triagem-faltas/pesquisa-selecoes/item', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessaoId, eanChave }),
      }).catch(() => {});
    },
    [sessaoId]
  );

  const handleLimparPesquisaSelecoes = useCallback(() => {
    setPesquisaSelecoes({});
    fetch(`/api/central-compras/triagem-faltas/pesquisa-selecoes/limpar?sessaoId=${encodeURIComponent(sessaoId)}`, {
      method: 'DELETE',
    }).catch(() => {});
    showToastSafe('Seleções da Pesquisa Livre removidas dos carrinhos.', 'info');
  }, [sessaoId, showToastSafe]);

  const approvedFaltasEanKeys = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (decisions[it.ean]?.comprar) {
        const chave = normalizeEanChaveFront(it.ean);
        if (chave) set.add(chave);
      }
    }
    return set;
  }, [decisions, items]);

  const persistSingleDecision = useCallback(
    async (ean: string, dec: TriagemDecisao) => {
      if (!sessaoId) return;
      setSyncInfo('Salvando...');
      try {
        const res = await fetch('/api/central-compras/triagem-faltas/decisao', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessaoId,
            ean,
            comprar: dec.comprar,
            portalIndex: dec.portalIndex,
            qtd: dec.qtd,
            motivo: dec.motivo,
            obs: dec.obs,
            usuario: user?.name || 'Usuário',
          }),
        });
        if (!res.ok) throw new Error('Erro HTTP');
        setSyncInfo(`Salvo no Belinha · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
      } catch {
        setSyncInfo('Salvo apenas localmente (verifique servidor)');
      }
    },
    [sessaoId, user?.name]
  );

  const persistBatchDecisions = useCallback(
    async (nextMap: Record<string, TriagemDecisao>) => {
      if (!sessaoId) return;
      setSyncInfo('Salvando alterações...');
      try {
        const payload = Object.entries(nextMap).map(([ean, dec]) => ({ ean, ...dec }));
        const res = await fetch('/api/central-compras/triagem-faltas/decisoes-lote', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessaoId,
            decisoes: payload,
            usuario: user?.name || 'Usuário',
          }),
        });
        if (!res.ok) throw new Error('Erro HTTP');
        setSyncInfo(`Salvo no Belinha · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
      } catch {
        setSyncInfo('Salvo apenas localmente (verifique servidor)');
      }
    },
    [sessaoId, user?.name]
  );

  const updateDecision = useCallback(
    (ean: string, patch: Partial<TriagemDecisao>, debounceObs = false) => {
      setDecisions((prev) => {
        const current = prev[ean];
        if (!current) return prev;
        const updated: TriagemDecisao = { ...current, ...patch };
        const next = { ...prev, [ean]: updated };
        try {
          const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
          if (cached?.sessao) {
            cached.decisoes = next;
            localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
          }
        } catch {}

        if (debounceObs) {
          if (obsTimersRef.current[ean]) window.clearTimeout(obsTimersRef.current[ean]);
          obsTimersRef.current[ean] = window.setTimeout(() => {
            persistSingleDecision(ean, updated);
          }, 450);
        } else {
          persistSingleDecision(ean, updated);
        }
        return next;
      });
    },
    [persistSingleDecision]
  );

  const handleRefreshFromServer = async (cotarPortais: boolean) => {
    setUpdatingAction(cotarPortais ? 'portais' : 'digifarma');
    try {
      const res = await fetch('/api/central-compras/triagem-faltas/atualizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotarPortais, usuario: user?.name || 'Usuário' }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data.sessao) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      applyServerPayload(data.sessao, data.decisoes || {});
      showToastSafe(
        cotarPortais
          ? `Faltas e cotações atualizadas ao vivo (${data.sessao.itens?.length || 0} itens).`
          : `Saldos e giro do Digifarma atualizados (${data.sessao.itens?.length || 0} itens).`,
        'success'
      );
    } catch (err: any) {
      showToastSafe(`Falha ao atualizar: ${err?.message || 'erro desconhecido'}`, 'error');
    } finally {
      setUpdatingAction('none');
    }
  };

  const handleRestaurarSugestao = () => {
    const def = buildDefaultDecisions(items);
    setDecisions(def);
    persistBatchDecisions(def);
    showToastSafe(`Lista restaurada para a sugestão inicial (${items.length} itens).`, 'info');
  };

  const handleSelecionarEconomicos = () => {
    const next: Record<string, TriagemDecisao> = { ...decisions };
    let marcados = 0;
    for (const it of items) {
      const offer = it.ofertas[0];
      const base = next[it.ean] || { comprar: false, portalIndex: 0, qtd: it.sug, motivo: '', obs: '' };
      if (!offer || it.pedidoRecente || it.packAlert || it.cadastroAlert) {
        next[it.ean] = {
          ...base,
          comprar: false,
          motivo:
            base.motivo ||
            (!offer
              ? 'Sem estoque nas distribuidoras cotadas'
              : it.pedidoRecente
              ? 'Já comprei / pedido em trânsito'
              : 'Embalagem/display — conferir fracionamento'),
        };
        continue;
      }
      if (offer.preco <= it.refCost * 1.05) {
        next[it.ean] = { ...base, comprar: true, portalIndex: 0 };
        marcados += 1;
      } else {
        next[it.ean] = { ...base, comprar: false, motivo: 'Preço subiu — aguardar oferta melhor' };
      }
    }
    setDecisions(next);
    persistBatchDecisions(next);
    showToastSafe(`Filtrado: ${marcados} itens empatados ou abaixo da última compra.`, 'success');
  };

  const getSelectedOffer = useCallback(
    (it: TriagemItem): TriagemOferta | null => {
      if (!it.ofertas.length) return null;
      const dec = decisions[it.ean];
      return it.ofertas[dec?.portalIndex || 0] || it.ofertas[0];
    },
    [decisions]
  );

  const isExcludedInvalid = useCallback(
    (it: TriagemItem): boolean => {
      const dec = decisions[it.ean];
      if (!dec || dec.comprar) return false;
      if (!dec.motivo) return true;
      if (dec.motivo === 'Outro motivo (especificar)' && !dec.obs.trim()) return true;
      return false;
    },
    [decisions]
  );

  const summary = useMemo(() => {
    let aprovados = 0;
    let totalUn = 0;
    let totalValor = 0;
    let totalEco = 0;
    let excluidos = 0;
    let semMotivo = 0;
    let pesquisaAprovados = 0;

    type UnifiedCartEntry = {
      origem: 'faltas' | 'pesquisa';
      ean: string;
      produto: string;
      lab: string;
      portal: string;
      qtd: number;
      preco: number;
      refCost: number;
      sub: number;
    };

    const byPortal: Record<
      string,
      { itens: UnifiedCartEntry[]; total: number; un: number; faltasCount: number; pesquisaCount: number }
    > = {};

    for (const it of items) {
      const dec = decisions[it.ean];
      if (!dec) continue;
      const offer = getSelectedOffer(it);
      if (dec.comprar && offer) {
        const sub = offer.preco * dec.qtd;
        aprovados += 1;
        totalUn += dec.qtd;
        totalValor += sub;
        if (!it.packAlert && !it.cadastroAlert && it.refCost > 0) {
          totalEco += (it.refCost - offer.preco) * dec.qtd;
        }
        if (!byPortal[offer.portal]) {
          byPortal[offer.portal] = { itens: [], total: 0, un: 0, faltasCount: 0, pesquisaCount: 0 };
        }
        byPortal[offer.portal].itens.push({
          origem: 'faltas',
          ean: it.ean,
          produto: it.produto,
          lab: offer.lab || '',
          portal: offer.portal,
          qtd: dec.qtd,
          preco: offer.preco,
          refCost: it.refCost,
          sub,
        });
        byPortal[offer.portal].total += sub;
        byPortal[offer.portal].un += dec.qtd;
        byPortal[offer.portal].faltasCount += 1;
      } else {
        excluidos += 1;
        if (isExcludedInvalid(it)) semMotivo += 1;
      }
    }

    for (const sel of Object.values(pesquisaSelecoes)) {
      const chaveNorm = normalizeEanChaveFront(sel.ean || sel.eanChave);
      if (chaveNorm && approvedFaltasEanKeys.has(chaveNorm)) {
        continue;
      }
      const sub = sel.preco * sel.qtd;
      aprovados += 1;
      pesquisaAprovados += 1;
      totalUn += sel.qtd;
      totalValor += sub;
      if (sel.refCost > 0) {
        totalEco += (sel.refCost - sel.preco) * sel.qtd;
      }
      if (!byPortal[sel.portal]) {
        byPortal[sel.portal] = { itens: [], total: 0, un: 0, faltasCount: 0, pesquisaCount: 0 };
      }
      byPortal[sel.portal].itens.push({
        origem: 'pesquisa',
        ean: sel.ean || sel.eanChave,
        produto: sel.descricao,
        lab: sel.laboratorio || '',
        portal: sel.portal,
        qtd: sel.qtd,
        preco: sel.preco,
        refCost: sel.refCost,
        sub,
      });
      byPortal[sel.portal].total += sub;
      byPortal[sel.portal].un += sel.qtd;
      byPortal[sel.portal].pesquisaCount += 1;
    }

    return { aprovados, totalUn, totalValor, totalEco, excluidos, semMotivo, pesquisaAprovados, byPortal };
  }, [approvedFaltasEanKeys, decisions, getSelectedOffer, isExcludedInvalid, items, pesquisaSelecoes]);

  // Distribuidoras com >= 1 produto cotado na triagem OU selecionado na pesquisa livre
  const quotedPortals = useMemo(() => {
    const quotedCounts: Record<string, number> = {};
    for (const it of items) {
      const seenInItem = new Set<string>();
      for (const o of it.ofertas) {
        if (!o?.portal || seenInItem.has(o.portal)) continue;
        seenInItem.add(o.portal);
        quotedCounts[o.portal] = (quotedCounts[o.portal] || 0) + 1;
      }
    }
    for (const portal of Object.keys(summary.byPortal)) {
      if (!(portal in quotedCounts)) {
        quotedCounts[portal] = 0;
      }
    }

    return Object.entries(quotedCounts)
      .filter(([portal, cotados]) => cotados > 0 || (summary.byPortal[portal]?.itens.length || 0) > 0)
      .map(([portal, cotados]) => {
        const selected = summary.byPortal[portal] || {
          itens: [],
          total: 0,
          un: 0,
          faltasCount: 0,
          pesquisaCount: 0,
        };
        return {
          portal,
          cotados,
          selecionados: selected.itens.length,
          faltasCount: selected.faltasCount,
          pesquisaCount: selected.pesquisaCount,
          un: selected.un,
          total: selected.total,
          min: PORTAL_ROBOT_ENDPOINTS[portal]?.min ?? 0,
          hasRobot: Boolean(PORTAL_ROBOT_ENDPOINTS[portal]),
          itens: selected.itens,
        };
      })
      .sort((a, b) => b.selecionados - a.selecionados || b.cotados - a.cotados || b.total - a.total);
  }, [items, summary.byPortal]);

  // Se filtro de portal apontar para portal que nao tem mais cotados apos refresh, volta a TODOS
  useEffect(() => {
    if (filterPortal !== 'TODOS' && !quotedPortals.some((p) => p.portal === filterPortal)) {
      setFilterPortal('TODOS');
    }
  }, [filterPortal, quotedPortals]);

  const countsByType = useMemo(() => {
    const meds = items.filter((i) => i.tipo === 'MEDICAMENTO').length;
    const perf = items.filter((i) => i.tipo === 'PERFUMARIA').length;
    const cotadosTotal = items.filter((i) => i.ofertas.length > 0).length;
    return { total: items.length, meds, perf, cotadosTotal };
  }, [items]);

  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      const dec = decisions[it.ean];
      const offer = getSelectedOffer(it);
      if (!dec) return false;
      if (filterTipo !== 'TODOS' && it.tipo !== filterTipo) return false;
      if (filterPortal !== 'TODOS' && !it.ofertas.some((o) => o.portal === filterPortal)) return false;

      if (filterStatus === 'COMPRAR' && !dec.comprar) return false;
      if (filterStatus === 'EXCLUIDO' && dec.comprar) return false;
      if (filterStatus === 'PENDENTE_MOTIVO' && !isExcludedInvalid(it)) return false;
      if (filterStatus === 'SEM_ESTOQUE' && it.ofertas.length > 0) return false;
      if (
        filterStatus === 'ECONOMIA' &&
        (!offer || it.packAlert || it.cadastroAlert || offer.preco > it.refCost)
      ) {
        return false;
      }
      if (filterStatus === 'ALERTA' && !it.packAlert && !it.cadastroAlert && !it.pedidoRecente) {
        return false;
      }

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const hay = `${it.produto} ${it.apresentacao} ${it.ean} ${it.subtipo} ${it.ofertas
          .map((o) => `${o.portal} ${o.lab || ''}`)
          .join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [decisions, filterPortal, filterStatus, filterTipo, getSelectedOffer, isExcludedInvalid, items, searchTerm]);

  const copyPortalText = async (portal: string, fromModal = false) => {
    const pData = quotedPortals.find((p) => p.portal === portal);
    if (!pData || pData.itens.length === 0) {
      const msg = `Nenhum item selecionado na distribuidora ${portal}.`;
      if (fromModal) setModalInlineStatus(msg);
      else showToastSafe(msg, 'warning');
      return;
    }
    const lines = [
      `*${portal}* (${pData.itens.length} itens | ${pData.un} un | ${fmtBRL(pData.total)}):`,
      ...pData.itens.map(
        (entry) => `- ${entry.produto} (${entry.ean}) x${entry.qtd} @ ${fmtBRL(entry.preco)}`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      const msg = `Lista de ${portal} (${pData.itens.length} itens) copiada!`;
      if (fromModal) setModalInlineStatus(msg);
      else showToastSafe(msg, 'success');
    } catch {
      const msg = 'Não foi possível copiar automaticamente; use a revisão para baixar CSV.';
      if (fromModal) setModalInlineStatus(msg);
      else showToastSafe(msg, 'error');
    }
  };

  const requestCartBuild = (portal: string) => {
    const pData = quotedPortals.find((p) => p.portal === portal);
    if (!pData || pData.itens.length === 0) {
      showToastSafe(`Selecione pelo menos 1 item de ${portal} para montar o carrinho.`, 'warning');
      return;
    }
    if (!PORTAL_ROBOT_ENDPOINTS[portal]) {
      showToastSafe(`Robô de carrinho não configurado para ${portal}.`, 'warning');
      return;
    }
    if (reviewDialogRef.current?.open) {
      reviewDialogRef.current.close();
    }
    setPendingCartPortal(portal);
    cartConfirmDialogRef.current?.showModal();
  };

  const startRobotPolling = useCallback(
    (portal: string, statusUrl: string) => {
      if (pollTimersRef.current[portal]) {
        window.clearInterval(pollTimersRef.current[portal]);
      }
      pollTimersRef.current[portal] = window.setInterval(async () => {
        try {
          const r = await fetch(statusUrl);
          if (!r.ok) return;
          const d = await r.json();
          const st = d?.status || d;
          if (!st) return;
          const emAndamento = Boolean(st.emAndamento);
          setRobotStates((prev) => ({
            ...prev,
            [portal]: {
              emAndamento,
              atual: Number(st.atual || 0),
              total: Number(st.total || prev[portal]?.total || 0),
              sucessos: Number(st.sucessos || 0),
              erros: Number(st.erros || 0),
              doneMsg: !emAndamento
                ? `Concluído: ${st.sucessos || 0} OK${Number(st.erros || 0) > 0 ? `, ${st.erros} erro(s)` : ''}`
                : undefined,
            },
          }));
          if (!emAndamento) {
            window.clearInterval(pollTimersRef.current[portal]);
            delete pollTimersRef.current[portal];
            showToastSafe(
              `Carrinho ${portal} finalizado: ${st.sucessos || 0} item(ns) incluído(s)${
                Number(st.erros || 0) > 0 ? `, ${st.erros} erro(s)` : ''
              }.`,
              Number(st.erros || 0) > 0 ? 'warning' : 'success',
              6000
            );
          }
        } catch {}
      }, 2500);
    },
    [showToastSafe]
  );

  const executeCartBuild = async (portal: string) => {
    const endpoint = PORTAL_ROBOT_ENDPOINTS[portal];
    const pData = quotedPortals.find((p) => p.portal === portal);
    if (!endpoint || !pData || pData.itens.length === 0) return;

    setRobotStates((prev) => ({
      ...prev,
      [portal]: { emAndamento: true, atual: 0, total: pData.itens.length, sucessos: 0, erros: 0 },
    }));

    try {
      const payload = {
        itens: pData.itens.map((entry) => ({
          ean: entry.ean,
          quantidade: entry.qtd,
          descricao: entry.produto,
          preco_unitario: entry.preco,
          preco_1: entry.preco,
          preco_ult_compra: entry.refCost,
        })),
      };
      const res = await fetch(endpoint.post, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      }
      showToastSafe(
        data?.message || `Robô ${portal} iniciado com ${pData.itens.length} itens.`,
        'info',
        5000
      );
      startRobotPolling(portal, endpoint.status);
    } catch (err: any) {
      setRobotStates((prev) => ({
        ...prev,
        [portal]: {
          emAndamento: false,
          atual: 0,
          total: pData.itens.length,
          sucessos: 0,
          erros: 1,
          doneMsg: `Erro: ${err?.message || 'falha'}`,
        },
      }));
      showToastSafe(`Falha ao montar carrinho em ${portal}: ${err?.message || 'erro'}`, 'error', 6000);
    }
  };

  const handleOpenReview = () => {
    const invalidEans = items.filter(isExcludedInvalid).map((x) => x.ean);
    if (invalidEans.length > 0) {
      const tbody = tbodyRef.current;
      const hasFirstVisible = tbody?.querySelector(`tr[data-row-ean="${invalidEans[0]}"]`);
      if (!hasFirstVisible) {
        setFilterTipo('TODOS');
        setFilterStatus('PENDENTE_MOTIVO');
        setFilterPortal('TODOS');
        setSearchTerm('');
      }

      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          const tb = tbodyRef.current;
          if (!tb) return;
          let firstControl: HTMLElement | null = null;
          for (const ean of invalidEans) {
            const sel = tb.querySelector(`select[data-action="motivo"][data-ean="${ean}"]`) as HTMLSelectElement | null;
            const obs = tb.querySelector(`input[data-action="obs"][data-ean="${ean}"]`) as HTMLInputElement | null;
            for (const ctrl of [sel, obs]) {
              if (!ctrl || !ctrl.required || ctrl.validity.valid) continue;
              fallbackDirtyRef.current.set(ctrl, { hasInteracted: true, hasBlurred: true, submitted: true });
              ctrl.classList.add('user-invalid-fallback');
              syncAria(ctrl, false);
              if (!firstControl) firstControl = ctrl;
            }
          }
          if (firstControl) {
            firstControl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstControl.focus();
          }
        }, 50);
      });

      showToastSafe(
        `${invalidEans.length} produto(s) excluído(s) ainda estão sem motivo. Explique por que não vão entrar neste pedido antes de revisar.`,
        'error',
        6000
      );
      return;
    }

    setActiveModalTab('aprovados');
    setModalInlineStatus('');
    reviewDialogRef.current?.showModal();
  };

  const buildExportPayload = () => {
    const compras: any[] = [];
    const excluidos: any[] = [];
    for (const it of items) {
      const dec = decisions[it.ean];
      const offer = getSelectedOffer(it);
      if (dec?.comprar && offer) {
        compras.push({
          ean: it.ean,
          produto: it.produto,
          tipo: it.tipo,
          distribuidora: offer.portal,
          laboratorio: offer.lab || '',
          qtd: dec.qtd,
          precoUnitario: offer.preco,
          subtotal: Number((offer.preco * dec.qtd).toFixed(2)),
          ultCompra: it.refCost,
        });
      } else {
        excluidos.push({
          ean: it.ean,
          produto: it.produto,
          tipo: it.tipo,
          melhorCotacao: offer ? `${offer.portal} ${fmtBRL(offer.preco)}` : 'Sem estoque',
          motivo: dec?.motivo || '',
          observacao: dec?.obs || '',
        });
      }
    }
    for (const sel of Object.values(pesquisaSelecoes)) {
      const chaveNorm = normalizeEanChaveFront(sel.ean || sel.eanChave);
      if (chaveNorm && approvedFaltasEanKeys.has(chaveNorm)) continue;
      compras.push({
        ean: sel.ean || sel.eanChave,
        produto: sel.descricao,
        tipo: 'PESQUISA_LIVRE',
        distribuidora: sel.portal,
        laboratorio: sel.laboratorio || '',
        qtd: sel.qtd,
        precoUnitario: sel.preco,
        subtotal: Number((sel.preco * sel.qtd).toFixed(2)),
        ultCompra: sel.refCost,
      });
    }
    return {
      sessaoId,
      data: new Date().toISOString().slice(0, 10),
      totais: {
        aprovados: summary.aprovados,
        unidades: summary.totalUn,
        valorTotal: Number(summary.totalValor.toFixed(2)),
        excluidos: summary.excluidos,
      },
      compras,
      excluidos,
    };
  };

  const handleCopyWhatsApp = async () => {
    const lines = [`*BELAFARMA · LISTA DE COMPRAS (${new Date().toLocaleDateString('pt-BR')})*`, ''];
    for (const pData of quotedPortals) {
      if (!pData.itens.length) continue;
      lines.push(`*${pData.portal}* (${pData.itens.length} itens | ${fmtBRL(pData.total)}):`);
      for (const entry of pData.itens) {
        lines.push(`- ${entry.produto} (${entry.ean}) x${entry.qtd} @ ${fmtBRL(entry.preco)}`);
      }
      lines.push('');
    }
    const excl = items.filter((it) => !decisions[it.ean]?.comprar);
    if (excl.length) {
      lines.push(`*EXCLUÍDOS DESTE PEDIDO (${excl.length}):*`);
      for (const it of excl) {
        const dec = decisions[it.ean];
        lines.push(`- ${it.produto}: ${dec?.motivo || 'Sem motivo'}${dec?.obs ? ` (${dec.obs})` : ''}`);
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setModalInlineStatus('Resumo WhatsApp copiado para a área de transferência.');
    } catch {
      setModalInlineStatus('Não foi possível copiar automaticamente; use o download CSV.');
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildExportPayload(), null, 2));
      setModalInlineStatus('JSON completo copiado para a área de transferência.');
    } catch {
      setModalInlineStatus('Falha ao copiar JSON.');
    }
  };

  const handleDownloadCsv = () => {
    const payload = buildExportPayload();
    const header = [
      'Decisao',
      'Tipo',
      'EAN',
      'Produto',
      'Distribuidora',
      'Qtd',
      'PrecoUnit',
      'Subtotal',
      'UltCompra',
      'MotivoExclusao',
      'Observacao',
    ];
    const csvRows = [header.join(';')];
    for (const c of payload.compras) {
      csvRows.push(
        [
          'COMPRAR',
          c.tipo,
          c.ean,
          `"${c.produto.replace(/"/g, '""')}"`,
          c.distribuidora,
          c.qtd,
          c.precoUnitario.toFixed(2).replace('.', ','),
          c.subtotal.toFixed(2).replace('.', ','),
          c.ultCompra.toFixed(2).replace('.', ','),
          '',
          '',
        ].join(';')
      );
    }
    for (const e of payload.excluidos) {
      csvRows.push(
        [
          'NAO_COMPRAR',
          e.tipo,
          e.ean,
          `"${e.produto.replace(/"/g, '""')}"`,
          `"${e.melhorCotacao}"`,
          0,
          '0,00',
          '0,00',
          '',
          `"${(e.motivo || '').replace(/"/g, '""')}"`,
          `"${(e.observacao || '').replace(/"/g, '""')}"`,
        ].join(';')
      );
    }
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `belafarma-triagem-faltas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setModalInlineStatus('Arquivo CSV baixado com sucesso.');
  };

  const pendingPortalInfo = pendingCartPortal
    ? quotedPortals.find((p) => p.portal === pendingCartPortal) || null
    : null;

  return (
    <div className="space-y-4">
      <div ref={srAnnouncerRef} id="triagem-sr-announcer" aria-live="polite" className="triagem-sr-only" />

      {/* Cabeçalho */}
      <header className="bg-[var(--bf-card-bg)] border border-[var(--bf-card-border)] rounded-xl p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-red-600 dark:text-red-400" />
            <h1 className="text-lg font-bold tracking-tight">
              Triagem de Faltas &amp; Cotação (Medicamentos + Perfumaria)
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
              {syncInfo}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Selecione o que realmente vai comprar, escolha a distribuidora em 1 clique e informe o motivo obrigatório para os itens excluídos.
            {atualizadoEm ? ` · Base atualizada em ${new Date(atualizadoEm).toLocaleString('pt-BR')}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={updatingAction !== 'none'}
            onClick={() => handleRefreshFromServer(false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {updatingAction === 'digifarma' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Atualizar Digifarma
          </button>

          <button
            type="button"
            disabled={updatingAction !== 'none'}
            onClick={() => handleRefreshFromServer(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {updatingAction === 'portais' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
            Cotar nos 4 Portais
          </button>

          <button
            type="button"
            onClick={handleRestaurarSugestao}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar Sugestão
          </button>

          <button
            type="button"
            onClick={handleSelecionarEconomicos}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs font-semibold cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Só Abaixo/Empate CMV
          </button>

          <button
            type="button"
            onClick={handleOpenReview}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer shadow-sm"
          >
            Revisar Pedido &amp; Justificativas
          </button>
        </div>
      </header>

      {/* Cards KPI + 1 Card/Botões Dinâmicos para cada Distribuidora que possui produtos cotados */}
      <section aria-label="Resumo da Compra e Distribuidoras Cotadas" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-[var(--bf-card-bg)] border border-[var(--bf-card-border)] rounded-xl p-3.5 space-y-1 shadow-sm">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Itens Aprovados</div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xl font-bold tabular-nums">{summary.aprovados}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{summary.totalUn} un</span>
          </div>
          <div className={`text-xs ${summary.semMotivo > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {summary.excluidos} excluídos · {summary.semMotivo} sem motivo
          </div>
        </div>

        <div className="bg-[var(--bf-card-bg)] border border-[var(--bf-card-border)] rounded-xl p-3.5 space-y-1 shadow-sm">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Estimado do Pedido</div>
          <div className="text-xl font-bold tabular-nums text-blue-700 dark:text-blue-400">
            {fmtBRL(summary.totalValor)}
          </div>
          <div
            className={`text-xs font-semibold ${
              summary.totalEco >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {summary.totalEco >= 0
              ? `Economia ref. últ. compra: ${fmtBRL(summary.totalEco)}`
              : `Variação ref. últ. compra: +${fmtBRL(Math.abs(summary.totalEco))}`}
          </div>
        </div>

        {quotedPortals.map((p) => {
          const pct = p.min > 0 ? Math.min(100, Math.round((p.total / p.min) * 100)) : 100;
          const ok = p.min <= 0 || p.total >= p.min;
          const falta = Math.max(0, p.min - p.total);
          const isFiltering = filterPortal === p.portal;
          const rState = robotStates[p.portal];

          return (
            <div
              key={p.portal}
              className={`bg-[var(--bf-card-bg)] border rounded-xl p-3.5 space-y-2 shadow-sm transition-colors ${
                isFiltering
                  ? 'border-blue-500 ring-1 ring-blue-500/40'
                  : 'border-[var(--bf-card-border)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold">{p.portal}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    p.selecionados === 0
                      ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      : ok
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  }`}
                >
                  {p.selecionados === 0 ? 'Sem selecionados' : ok ? 'Mínimo OK' : `Falta ${fmtBRL(falta)}`}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <span className="text-base font-bold tabular-nums">{fmtBRL(p.total)}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {p.pesquisaCount > 0
                    ? `${p.faltasCount} faltas + ${p.pesquisaCount} pesquisa`
                    : `${p.selecionados} sel. / ${p.cotados} cotados`}
                </span>
              </div>

              <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${ok && p.selecionados > 0 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                  style={{ width: `${p.selecionados > 0 ? pct : 0}%` }}
                />
              </div>

              {rState && (rState.emAndamento || rState.doneMsg) && (
                <div className="text-xs font-medium text-blue-700 dark:text-blue-300">
                  {rState.emAndamento
                    ? `Montando: ${rState.atual}/${rState.total} (${rState.sucessos} OK)`
                    : rState.doneMsg}
                </div>
              )}

              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setFilterPortal(isFiltering ? 'TODOS' : p.portal)}
                  aria-pressed={isFiltering}
                  title={`Filtrar produtos cotados na ${p.portal}`}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold cursor-pointer ${
                    isFiltering
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  {isFiltering ? 'Filtrando ✓' : `Filtrar (${p.cotados})`}
                </button>

                {p.hasRobot && (
                  <button
                    type="button"
                    disabled={p.selecionados === 0 || Boolean(rState?.emAndamento)}
                    onClick={() => requestCartBuild(p.portal)}
                    title={`Enviar ${p.selecionados} item(ns) aprovado(s) para o carrinho da ${p.portal}`}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {rState?.emAndamento ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ShoppingCart className="w-3 h-3" />
                    )}
                    Carrinho
                  </button>
                )}

                <button
                  type="button"
                  disabled={p.selecionados === 0}
                  onClick={() => copyPortalText(p.portal, false)}
                  title={`Copiar pedido da ${p.portal}`}
                  aria-label={`Copiar pedido da ${p.portal}`}
                  className="inline-flex items-center justify-center p-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-45"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {/* Navegação por Abas: Faltas do Digifarma | Pesquisa Livre por Termo */}
      <div className="bg-[var(--bf-card-bg)] border border-[var(--bf-card-border)] rounded-xl px-4 pt-2 shadow-sm">
        <div role="tablist" aria-label="Modos de cotação da tela" className="triagem-main-tablist">
          <button
            type="button"
            id="triagem-tab-faltas"
            role="tab"
            aria-selected={activePageTab === 'faltas'}
            onClick={() => setActivePageTab('faltas')}
            className="triagem-main-tab"
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <span>Faltas do Digifarma</span>
            <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-slate-100 dark:bg-slate-800 tabular-nums">
              {items.length}
            </span>
          </button>

          <button
            type="button"
            id="triagem-tab-pesquisa"
            role="tab"
            aria-selected={activePageTab === 'pesquisa'}
            onClick={() => setActivePageTab('pesquisa')}
            className="triagem-main-tab"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Pesquisa Livre por Termo</span>
            {pesquisaAtual?.status === 'em_andamento' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 tabular-nums">
                <Loader2 className="w-3 h-3 animate-spin" />
                {Object.values(pesquisaAtual.portaisStatus || {}).filter(
                  (s) => s.status === 'concluido' || s.status === 'erro'
                ).length}
                /8
              </span>
            )}
            {summary.pesquisaAprovados > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 font-bold tabular-nums">
                {summary.pesquisaAprovados} sel.
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Aviso discreto quando pesquisa livre está rodando em segundo plano enquanto vê as Faltas */}
      {activePageTab === 'faltas' && pesquisaAtual?.status === 'em_andamento' && (
        <div
          role="status"
          aria-live="polite"
          className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-2 font-semibold text-blue-800 dark:text-blue-200">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>
              Pesquisa livre "{pesquisaAtual.termo}" rodando em segundo plano (
              {Object.values(pesquisaAtual.portaisStatus || {}).filter(
                (s) => s.status === 'concluido' || s.status === 'erro'
              ).length}
              /8 dists)
            </span>
          </div>
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <progress
              className="triagem-progress"
              max={8}
              value={Object.values(pesquisaAtual.portaisStatus || {}).filter(
                (s) => s.status === 'concluido' || s.status === 'erro'
              ).length}
              aria-label="Progresso em segundo plano da pesquisa livre"
            />
            <button
              type="button"
              onClick={() => setActivePageTab('pesquisa')}
              className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer whitespace-nowrap"
            >
              Ver resultados
            </button>
          </div>
        </div>
      )}

      {/* Painel Aba 1: Faltas do Digifarma */}
      <div
        role="tabpanel"
        aria-labelledby="triagem-tab-faltas"
        hidden={activePageTab !== 'faltas'}
      >
        <div className="space-y-4">
      {/* Filtros + Botões de Acesso Rápido por Distribuidora Cotada */}
      <section aria-label="Filtros da lista" className="bg-[var(--bf-card-bg)] border border-[var(--bf-card-border)] rounded-xl p-3.5 space-y-2.5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800" role="group" aria-label="Categoria">
              {(
                [
                  ['TODOS', `Todos (${countsByType.total})`],
                  ['MEDICAMENTO', `Medicamentos (${countsByType.meds})`],
                  ['PERFUMARIA', `Perfumaria (${countsByType.perf})`],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFilterTipo(val)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    filterTipo === val
                      ? 'bg-red-600 text-white font-bold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filtrar por situação"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
            >
              <option value="TODOS">Todas as situações</option>
              <option value="COMPRAR">Somente selecionados p/ comprar</option>
              <option value="EXCLUIDO">Somente excluídos (não entram)</option>
              <option value="PENDENTE_MOTIVO">Excluídos SEM justificativa</option>
              <option value="SEM_ESTOQUE">Sem estoque nas distribuidoras</option>
              <option value="ECONOMIA">Mais baratos que última compra</option>
              <option value="ALERTA">Com alerta (emb./cadastro/24-11)</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Buscar por nome ou EAN"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar produto, EAN ou princípio ativo..."
                className="h-9 w-full sm:w-72 pl-8 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
              {visibleItems.length} de {items.length} itens visíveis
            </span>
          </div>
        </div>

        {/* Pills dinâmicas: 1 botão para cada distribuidora que tem produtos cotados */}
        {quotedPortals.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800" role="group" aria-label="Filtrar por distribuidora cotada">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Distribuidoras com produtos cotados:
            </span>
            <button
              type="button"
              aria-pressed={filterPortal === 'TODOS'}
              onClick={() => setFilterPortal('TODOS')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
                filterPortal === 'TODOS'
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Todas ({countsByType.cotadosTotal} cotados)
            </button>
            {quotedPortals.map((p) => {
              const active = filterPortal === p.portal;
              return (
                <button
                  key={p.portal}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilterPortal(active ? 'TODOS' : p.portal)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{p.portal}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-xs tabular-nums ${active ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>
                    {p.cotados}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Tabela Responsiva */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby="triagem-table-caption"
        className="triagem-table-wrapper shadow-sm"
      >
        <table className="triagem-table text-xs">
          <caption id="triagem-table-caption" className="triagem-sr-only">
            Lista de faltas de medicamentos e perfumaria cotadas em 4 distribuidoras com seleção direta por distribuidora e justificativa obrigatória para itens excluídos
          </caption>
          <thead>
            <tr>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left w-24">
                Comprar
              </th>
              <th scope="col" className="col-produto whitespace-nowrap px-3 py-2.5 text-left">
                Produto / Giro Digifarma
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right w-24">
                Últ. Compra
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left min-w-[270px]">
                Distribuidora &amp; Preço (1 clique)
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right w-20">
                Qtd 30d
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right w-28">
                Subtotal
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left min-w-[270px]">
                Motivo se NÃO entrar no pedido
              </th>
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-xs text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando lista de faltas e cotações...
                  </span>
                </td>
              </tr>
            ) : visibleItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-xs text-slate-500">
                  Nenhum produto encontrado para os filtros atuais.
                </td>
              </tr>
            ) : (
              visibleItems.map((it) => {
                const dec = decisions[it.ean];
                if (!dec) return null;
                const offer = getSelectedOffer(it);
                const hasOffer = it.ofertas.length > 0;
                const sub = dec.comprar && offer ? offer.preco * dec.qtd : 0;

                let ecoNode: React.ReactNode = <span className="text-xs text-slate-400">—</span>;
                if (offer && !it.packAlert && !it.cadastroAlert && it.refCost > 0) {
                  const diff = offer.preco - it.refCost;
                  const pct = (diff / it.refCost) * 100;
                  if (diff <= -0.01) {
                    ecoNode = (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-semibold tabular-nums">
                        {pct.toFixed(0)}% vs últ.
                      </span>
                    );
                  } else if (diff <= it.refCost * 0.05) {
                    ecoNode = (
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs font-semibold tabular-nums">
                        Empate
                      </span>
                    );
                  } else {
                    ecoNode = (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-semibold tabular-nums">
                        +{pct.toFixed(0)}% vs últ.
                      </span>
                    );
                  }
                }

                const motivoErrId = `err-motivo-${it.ean}`;
                const obsErrId = `err-obs-${it.ean}`;
                const obsReq = !dec.comprar && dec.motivo === 'Outro motivo (especificar)';

                return (
                  <tr
                    key={it.ean}
                    data-row-ean={it.ean}
                    className={dec.comprar ? 'triagem-row-selected' : 'triagem-row-excluded'}
                  >
                    <td className="px-3 py-2.5">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none font-semibold">
                        <input
                          type="checkbox"
                          checked={dec.comprar}
                          disabled={!hasOffer}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            updateDecision(it.ean, {
                              comprar: checked,
                              motivo: checked ? dec.motivo : dec.motivo || '',
                            });
                            if (!checked) {
                              window.requestAnimationFrame(() => {
                                const sel = tbodyRef.current?.querySelector(
                                  `select[data-action="motivo"][data-ean="${it.ean}"]`
                                ) as HTMLSelectElement | null;
                                sel?.focus();
                              });
                            }
                          }}
                          className="w-4 h-4 accent-red-600 cursor-pointer"
                        />
                        <span>{dec.comprar ? 'Pedir' : 'Fora'}</span>
                      </label>
                    </td>

                    <th scope="row" className="col-produto px-3 py-2.5 text-left font-normal">
                      <div className="font-bold leading-snug">{it.produto}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{it.ean}</span>
                        <span>·</span>
                        <span className={it.est <= 0 ? 'text-red-600 dark:text-red-400 font-bold' : 'font-semibold'}>
                          Est: {it.est}
                        </span>
                        <span>·</span>
                        <span className="tabular-nums">
                          30d: {it.v30} / 90d: {it.v90}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium">
                          {it.tipo === 'MEDICAMENTO' ? it.subtipo : 'Perfumaria'}
                        </span>
                        {it.c1 && (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-xs font-semibold">
                            C1
                          </span>
                        )}
                        {it.pedidoRecente && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs font-semibold">
                            Pedido 24/11
                          </span>
                        )}
                        {it.packAlert && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-semibold">
                            Cx/Display
                          </span>
                        )}
                        {it.cadastroAlert && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-semibold">
                            CMV pendente
                          </span>
                        )}
                      </div>
                    </th>

                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      <div className="font-semibold">{it.refCost > 0 ? fmtBRL(it.refCost) : '—'}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Vnd {fmtBRL(it.prVenda)}</div>
                    </td>

                    <td className="px-3 py-2.5">
                      {hasOffer && offer ? (
                        <div className="space-y-1.5">
                          <div
                            className="flex flex-wrap gap-1.5"
                            role="group"
                            aria-label={`Distribuidoras cotadas para ${it.produto}`}
                          >
                            {it.ofertas.map((o, idx) => {
                              const isSelected = dec.comprar && idx === dec.portalIndex;
                              const isHighlightedFilter = filterPortal !== 'TODOS' && o.portal === filterPortal;
                              const tooltip = [
                                o.portal,
                                fmtBRL(o.preco),
                                o.precoSemSt && o.precoSemSt !== o.preco ? `s/ ST ${fmtBRL(o.precoSemSt)}` : '',
                                o.lab || '',
                                o.val ? `Val ${o.val}` : '',
                              ]
                                .filter(Boolean)
                                .join(' · ');

                              return (
                                <button
                                  key={`${o.portal}-${idx}`}
                                  type="button"
                                  aria-pressed={isSelected}
                                  title={tooltip}
                                  onClick={() => updateDecision(it.ean, { comprar: true, portalIndex: idx })}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold tabular-nums cursor-pointer transition-colors ${
                                    isSelected
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                      : isHighlightedFilter
                                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-400 dark:border-blue-700 hover:bg-blue-100'
                                      : idx === 0
                                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-slate-800 dark:text-slate-200 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3 shrink-0" />}
                                  <span>{o.portal}</span>
                                  <span>·</span>
                                  <span>{fmtBRL(o.preco)}</span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {ecoNode}
                            {offer.lab && <span className="text-xs text-slate-500 dark:text-slate-400">{offer.lab}</span>}
                            {offer.val && <span className="text-xs text-slate-500 dark:text-slate-400">· Val {offer.val}</span>}
                          </div>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-xs font-semibold inline-block">
                          Sem estoque nos 4 portais
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <input
                        type="number"
                        min={1}
                        max={999}
                        disabled={!hasOffer || !dec.comprar}
                        aria-label={`Quantidade de ${it.produto}`}
                        value={dec.qtd}
                        onChange={(e) =>
                          updateDecision(it.ean, { qtd: Math.max(1, parseInt(e.target.value, 10) || it.sug) })
                        }
                        className="w-16 h-8 px-2 text-right rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold tabular-nums disabled:opacity-50"
                      />
                    </td>

                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-bold">
                      {dec.comprar && offer ? fmtBRL(sub) : <span className="text-slate-400 font-normal">—</span>}
                    </td>

                    <td className="px-3 py-2.5">
                      {dec.comprar ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400 py-1.5">
                          Incluído no pedido ·{' '}
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Compra confirmada</span>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div>
                            <select
                              data-action="motivo"
                              data-ean={it.ean}
                              data-error={motivoErrId}
                              required
                              aria-invalid="false"
                              aria-label={`Motivo para não comprar ${it.produto}`}
                              value={dec.motivo}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateDecision(it.ean, { motivo: val });
                                if (val === 'Outro motivo (especificar)') {
                                  window.requestAnimationFrame(() => {
                                    const obsEl = tbodyRef.current?.querySelector(
                                      `input[data-action="obs"][data-ean="${it.ean}"]`
                                    ) as HTMLInputElement | null;
                                    obsEl?.focus();
                                  });
                                }
                              }}
                              className="triagem-motivo-select w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
                            >
                              <option value="" disabled>
                                Selecione o motivo...
                              </option>
                              {MOTIVOS_EXCLUSAO.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <div id={motivoErrId} className="triagem-error-msg">
                              Escolha por que este item não vai entrar no pedido.
                            </div>
                          </div>
                          <div>
                            <input
                              type="text"
                              data-action="obs"
                              data-ean={it.ean}
                              data-error={obsErrId}
                              required={obsReq}
                              aria-invalid="false"
                              aria-label={`Observação da exclusão para ${it.produto}`}
                              value={dec.obs}
                              onChange={(e) => updateDecision(it.ean, { obs: e.target.value }, true)}
                              placeholder={
                                obsReq
                                  ? 'Descreva o motivo (obrigatório)...'
                                  : 'Observação opcional (ex.: já tenho 2 na gôndola)'
                              }
                              className="triagem-obs-input w-full h-8 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                            />
                            <div id={obsErrId} className="triagem-error-msg">
                              Descreva o motivo no campo de observação.
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
        </div>
      </div>

      {/* Painel Aba 2: Pesquisa Livre por Termo */}
      <div
        role="tabpanel"
        aria-labelledby="triagem-tab-pesquisa"
        hidden={activePageTab !== 'pesquisa'}
      >
        <TriagemPesquisaLivreTab
          pesquisaAtual={pesquisaAtual}
          historico={pesquisaHistorico}
          selecoes={pesquisaSelecoes}
          approvedFaltasEanKeys={approvedFaltasEanKeys}
          iniciandoBusca={iniciandoBuscaLivre}
          onIniciarPesquisa={handleIniciarPesquisaLivre}
          onCancelarPesquisa={handleCancelarPesquisaLivre}
          onSelecionarHistorico={handleSelecionarHistoricoLivre}
          onToggleSelecao={handleTogglePesquisaSelecao}
          onChangeQtdSelecao={handleChangePesquisaQtd}
          onRemoverSelecao={handleRemoverPesquisaSelecao}
          onLimparSelecoes={handleLimparPesquisaSelecoes}
        />
      </div>

      {/* Modal Nativa de Revisão & Exportação */}
      <dialog
        ref={reviewDialogRef}
        className="triagem-modal"
        aria-labelledby="triagem-review-title"
        {...({ closedby: 'any' } as any)}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div>
            <h1 id="triagem-review-title" className="text-base font-bold">
              Revisão Final do Pedido &amp; Justificativas de Exclusão
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {summary.aprovados} itens aprovados ({summary.totalUn} un · {fmtBRL(summary.totalValor)}) e{' '}
              {summary.excluidos} excluídos com justificativa registrada.
            </p>
          </div>
          <form method="dialog">
            <button
              value="close"
              autoFocus
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:opacity-90 text-xs font-semibold cursor-pointer"
            >
              Fechar
            </button>
          </form>
        </div>

        <div className="px-5 pt-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex gap-2" role="tablist" aria-label="Abas da revisão">
            <button
              type="button"
              role="tab"
              aria-selected={activeModalTab === 'aprovados'}
              onClick={() => setActiveModalTab('aprovados')}
              className={`px-3 py-2 text-xs font-semibold border-b-2 cursor-pointer ${
                activeModalTab === 'aprovados'
                  ? 'border-red-600 text-red-600 dark:text-red-400'
                  : 'border-transparent text-slate-500'
              }`}
            >
              Pedido Aprovado por Distribuidora
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeModalTab === 'excluidos'}
              onClick={() => setActiveModalTab('excluidos')}
              className={`px-3 py-2 text-xs font-semibold border-b-2 cursor-pointer ${
                activeModalTab === 'excluidos'
                  ? 'border-red-600 text-red-600 dark:text-red-400'
                  : 'border-transparent text-slate-500'
              }`}
            >
              Produtos Excluídos &amp; Motivos
            </button>
          </div>
          <div role="status" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 py-1">
            {modalInlineStatus}
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {activeModalTab === 'aprovados' ? (
            quotedPortals.every((p) => p.itens.length === 0) ? (
              <p className="text-slate-500 py-6 text-center">Nenhum item selecionado para compra até o momento.</p>
            ) : (
              quotedPortals.map((p) => {
                if (!p.itens.length) return null;
                const ok = p.min <= 0 || p.total >= p.min;
                return (
                  <div key={p.portal} className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50 dark:bg-slate-900/60 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-sm">
                        {p.portal} · {p.itens.length} itens ({p.un} un)
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            ok
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          }`}
                        >
                          {ok ? 'Mínimo atingido' : `Falta ${fmtBRL(p.min - p.total)} para mín. ${fmtBRL(p.min)}`}
                        </span>
                        <span className="font-bold text-sm tabular-nums">{fmtBRL(p.total)}</span>
                        <button
                          type="button"
                          onClick={() => copyPortalText(p.portal, true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          Copiar {p.portal}
                        </button>
                        {p.hasRobot && (
                          <button
                            type="button"
                            onClick={() => requestCartBuild(p.portal)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                          >
                            <ShoppingCart className="w-3 h-3" />
                            Montar Carrinho {p.portal}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-700">
                            <th className="py-1 pr-2 text-left whitespace-nowrap">EAN</th>
                            <th className="py-1 pr-2 text-left whitespace-nowrap">Produto</th>
                            <th className="py-1 px-2 text-right whitespace-nowrap">Qtd</th>
                            <th className="py-1 px-2 text-right whitespace-nowrap">Unit.</th>
                            <th className="py-1 pl-2 text-right whitespace-nowrap">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.itens.map((entry, idx) => (
                            <tr key={`${entry.ean}-${entry.origem}-${idx}`} className="border-b border-slate-200/70 dark:border-slate-800">
                              <td className="py-1.5 pr-2 font-mono">{entry.ean}</td>
                              <td className="py-1.5 pr-2 font-medium">
                                {entry.produto}
                                {entry.origem === 'pesquisa' && (
                                  <span className="ml-1.5 px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 text-[10px] font-bold">
                                    Pesquisa
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-right tabular-nums font-bold">{entry.qtd}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums">{fmtBRL(entry.preco)}</td>
                              <td className="py-1.5 pl-2 text-right tabular-nums font-bold">{fmtBRL(entry.sub)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-1.5 pr-2 text-left whitespace-nowrap">EAN</th>
                    <th className="py-1.5 pr-2 text-left whitespace-nowrap">Produto</th>
                    <th className="py-1.5 px-2 text-left whitespace-nowrap">Melhor Cotação</th>
                    <th className="py-1.5 px-2 text-left whitespace-nowrap">Motivo da Exclusão</th>
                    <th className="py-1.5 pl-2 text-left whitespace-nowrap">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .filter((it) => !decisions[it.ean]?.comprar)
                    .map((it) => {
                      const dec = decisions[it.ean];
                      const offer = getSelectedOffer(it);
                      return (
                        <tr key={it.ean} className="border-b border-slate-200/70 dark:border-slate-800">
                          <td className="py-2 pr-2 font-mono">{it.ean}</td>
                          <td className="py-2 pr-2 font-medium">{it.produto}</td>
                          <td className="py-2 px-2">
                            {offer ? `${offer.portal} (${fmtBRL(offer.preco)})` : 'Sem estoque'}
                          </td>
                          <td className="py-2 px-2 font-semibold">{dec?.motivo || 'Não informado'}</td>
                          <td className="py-2 pl-2 text-slate-500">{dec?.obs || '—'}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Todas as escolhas ficam salvas automaticamente no banco do Belinha.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:opacity-90 text-xs font-semibold cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar WhatsApp
            </button>
            <button
              type="button"
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:opacity-90 text-xs font-semibold cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar JSON
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar CSV (Excel)
            </button>
          </div>
        </div>
      </dialog>

      {/* Modal Nativa de Confirmação para Montagem de Carrinho por Distribuidora */}
      <dialog
        ref={cartConfirmDialogRef}
        className="triagem-modal triagem-modal-sm"
        aria-labelledby="triagem-cart-confirm-title"
        {...({ closedby: 'any' } as any)}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <h1 id="triagem-cart-confirm-title" className="text-base font-bold">
            Confirmar Montagem de Carrinho — {pendingCartPortal || ''}
          </h1>
        </div>
        <div className="p-5 space-y-3 text-xs">
          {pendingPortalInfo && (
            <>
              <p className="leading-relaxed">
                Você está prestes a acionar o robô da distribuidora{' '}
                <strong>{pendingPortalInfo.portal}</strong> com{' '}
                <strong>
                  {pendingPortalInfo.selecionados} item(ns) ({pendingPortalInfo.un} un)
                </strong>{' '}
                totalizando <strong className="tabular-nums">{fmtBRL(pendingPortalInfo.total)}</strong>.
              </p>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Os itens serão incluídos no carrinho aberto do portal sem finalizar o pedido, para você revisar e fechar pessoalmente.
              </p>
            </>
          )}
        </div>
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-end gap-2">
          <form method="dialog" className="flex items-center gap-2">
            <button
              value="cancel"
              autoFocus
              className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                const portal = pendingCartPortal;
                cartConfirmDialogRef.current?.close();
                if (portal) executeCartBuild(portal);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Confirmar e Montar Carrinho
            </button>
          </form>
        </div>
      </dialog>
    </div>
  );
};
