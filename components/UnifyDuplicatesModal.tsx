import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  GitMerge,
  History,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import { useToast } from './ToastContext';

export interface DuplicateCandidateItem {
  id: number | string;
  customer_id?: string | null;
  card_id?: number | null;
  digifarma_cliente_id?: number | null;
  name: string;
  nickname?: string;
  cpf?: string;
  phone?: string;
  principal_balance?: number;
  credit_limit?: number;
  df_items_count?: number;
  df_payments_count?: number;
  source?: string;
}

export interface DuplicateSuggestedPair {
  key: string;
  source: DuplicateCandidateItem;
  target: DuplicateCandidateItem;
  reasonCode: string;
  reasonLabel: string;
  bothInDigifarma: boolean;
}

export interface DuplicatesApiState {
  autoReport: {
    sanitizedCards: Array<{ cardId: number; name: string; previousDfId: any; newDfId: any }>;
    mergedCards: Array<{ fromCardId: number; fromName: string; toCardId: number; toName: string; reason: string }>;
    mergedCustomers: Array<{ fromId: string; fromName: string; toId: string; toName: string; reason: string }>;
    totalMergedCards: number;
    totalMergedCustomers: number;
  };
  suggestedCardPairs: DuplicateSuggestedPair[];
  suggestedCustomerPairs: DuplicateSuggestedPair[];
  cards: DuplicateCandidateItem[];
  customers: DuplicateCandidateItem[];
  lastUnifyReport: {
    executedAt?: string;
    totalMergedCards?: number;
    totalMergedCustomers?: number;
    mergedCards?: Array<{ fromCardId: number; fromName: string; toCardId: number; toName: string; reason: string }>;
    mergedCustomers?: Array<{ fromId: string; fromName: string; toId: string; toName: string; reason: string }>;
  } | null;
  totalAttentionCount: number;
}

export interface UnifyDuplicatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMerged?: () => void;
  initialEntityType?: 'card' | 'customer';
}

function formatCurrency(val?: number | null): string {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateTimeBR(iso?: string | null): string {
  if (!iso) return 'Ainda não executada';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return String(iso);
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function cleanCpfDigits(v?: string | null): string {
  return String(v || '').replace(/\D/g, '');
}

const REASON_LABELS: Record<string, string> = {
  SAME_DIGIFARMA_ID: 'Mesmo ID no Digifarma',
  SAME_CPF: 'Mesmo CPF',
  EXACT_NORMALIZED_NAME: 'Nome idêntico',
  SUBSET_TOKENS: 'Nome abreviado correspondente',
  SUBSET_TOKENS_ACTIVE: 'Nome abreviado (conta ativa)',
  UNIQUE_FIRST_TOKEN_MANUAL: 'Mesmo 1º nome (cadastro único)',
  FIRST_TOKEN_NOVO_CADASTRO: 'Mesmo 1º nome (Novo Cadastro)',
  MANUAL: 'Unificado manualmente (Belinha)',
  MANUAL_WITH_DIGIFARMA: 'Unificado manualmente (Belinha + Digifarma)',
  MANUAL_LINKED_CARD: 'Cliente vinculado à conta unificada'
};

export const UnifyDuplicatesModal: React.FC<UnifyDuplicatesModalProps> = ({
  isOpen,
  onClose,
  onMerged,
  initialEntityType = 'card'
}) => {
  const { addToast } = useToast();
  const uid = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [activeTab, setActiveTab] = useState<'detected' | 'manual' | 'history'>('detected');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DuplicatesApiState | null>(null);
  const [runningAuto, setRunningAuto] = useState(false);

  // Estado dos pares sugeridos
  const [swappedKeys, setSwappedKeys] = useState<Record<string, boolean>>({});
  const [pairIncludeDf, setPairIncludeDf] = useState<Record<string, boolean>>({});
  const [confirmPairKey, setConfirmPairKey] = useState<string | null>(null);
  const [mergingPairKey, setMergingPairKey] = useState<string | null>(null);

  // Aba Manual
  const [entityType, setEntityType] = useState<'card' | 'customer'>(initialEntityType);
  const [manualSearch, setManualSearch] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [manualAlsoDigifarma, setManualAlsoDigifarma] = useState(false);
  const [forceDifferentCpf, setForceDifferentCpf] = useState(false);
  const [manualStatusMsg, setManualStatusMsg] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);

  const loadDuplicates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/crediario-v2/maintenance/duplicates');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao buscar cadastros duplicados.');
      }
      setData(json);
    } catch (err: any) {
      addToast(err?.message || 'Erro ao analisar duplicados.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // Gerencia abertura e fechamento nativo via showModal() + light-dismiss fallback (modern-web-guidance: dialog)
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    if (isOpen) {
      setEntityType(initialEntityType);
      setManualStatusMsg('');
      setConfirmPairKey(null);
      if (!dlg.open) {
        try {
          dlg.showModal();
        } catch {}
      }
      loadDuplicates();
    } else if (dlg.open) {
      dlg.close();
    }
  }, [dialogRef, isOpen, initialEntityType, loadDuplicates]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    const handleClose = () => {
      dlg.returnValue = '';
      if (isOpen) onClose();
    };
    dlg.addEventListener('close', handleClose);

    let cleanupFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const isOutside = (e: PointerEvent) => {
        const r = dlg.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      const onDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) dlg.close();
      };
      dlg.addEventListener('pointerdown', onDown);
      dlg.addEventListener('pointerup', onUp);
      cleanupFallback = () => {
        dlg.removeEventListener('pointerdown', onDown);
        dlg.removeEventListener('pointerup', onUp);
      };
    }

    return () => {
      dlg.removeEventListener('close', handleClose);
      if (cleanupFallback) cleanupFallback();
    };
  }, [dialogRef, isOpen, onClose]);

  const handleRunAutoUnify = async () => {
    setRunningAuto(true);
    try {
      const res = await fetch('/api/crediario-v2/maintenance/unify-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, reconcileDigifarma: false })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao executar unificação automática.');
      }
      const mc = json.report?.totalMergedCards || 0;
      const mu = json.report?.totalMergedCustomers || 0;
      addToast(
        mc > 0 || mu > 0
          ? `Unificação concluída: ${mc} conta(s) do crediário e ${mu} cliente(s) unificados!`
          : 'Nenhum duplicado automático pendente foi encontrado no momento.',
        mc > 0 || mu > 0 ? 'success' : 'info'
      );
      await loadDuplicates();
      onMerged?.();
    } catch (err: any) {
      addToast(err?.message || 'Erro na unificação automática.', 'error');
    } finally {
      setRunningAuto(false);
    }
  };

  const handleMergePair = async (pairEntityType: 'card' | 'customer', pair: DuplicateSuggestedPair) => {
    const fullKey = `${pairEntityType}:${pair.key}`;
    const swapped = Boolean(swappedKeys[fullKey]);
    const effectiveSource = swapped ? pair.target : pair.source;
    const effectiveTarget = swapped ? pair.source : pair.target;
    const alsoDf = Boolean(pairIncludeDf[fullKey]);

    setMergingPairKey(fullKey);
    try {
      const res = await fetch('/api/crediario-v2/maintenance/merge-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: pairEntityType,
          sourceId: effectiveSource.id,
          targetId: effectiveTarget.id,
          alsoMergeDigifarma: alsoDf
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Não foi possível unificar este par.');
      }

      addToast(
        `Unificado "${effectiveSource.name}" → "${effectiveTarget.name}"${json.digifarmaMerged ? ' (Belinha + Digifarma)!' : '!'}` ,
        'success'
      );
      setConfirmPairKey(null);
      await loadDuplicates();
      onMerged?.();
    } catch (err: any) {
      addToast(err?.message || 'Erro ao unificar par.', 'error');
    } finally {
      setMergingPairKey(null);
    }
  };

  const manualOptions = useMemo(() => {
    const base = entityType === 'card' ? (data?.cards || []) : (data?.customers || []);
    const q = manualSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter(item => {
      return (
        item.name.toLowerCase().includes(q) ||
        String(item.nickname || '').toLowerCase().includes(q) ||
        String(item.cpf || '').toLowerCase().includes(q) ||
        String(item.phone || '').toLowerCase().includes(q) ||
        String(item.digifarma_cliente_id || item.id).toLowerCase().includes(q)
      );
    });
  }, [data, entityType, manualSearch]);

  const selectedSource = useMemo(() => {
    const list = entityType === 'card' ? (data?.cards || []) : (data?.customers || []);
    return list.find(i => String(i.id) === String(sourceId)) || null;
  }, [data, entityType, sourceId]);

  const selectedTarget = useMemo(() => {
    const list = entityType === 'card' ? (data?.cards || []) : (data?.customers || []);
    return list.find(i => String(i.id) === String(targetId)) || null;
  }, [data, entityType, targetId]);

  const manualBothInDigifarma = Boolean(
    selectedSource?.digifarma_cliente_id &&
    selectedTarget?.digifarma_cliente_id &&
    Number(selectedSource.digifarma_cliente_id) !== Number(selectedTarget.digifarma_cliente_id)
  );

  const manualCpfConflict = useMemo(() => {
    const c1 = cleanCpfDigits(selectedSource?.cpf);
    const c2 = cleanCpfDigits(selectedTarget?.cpf);
    return Boolean(c1.length >= 11 && c2.length >= 11 && c1 !== c2);
  }, [selectedSource, selectedTarget]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualStatusMsg('');

    if (!sourceId || !targetId) {
      setManualStatusMsg('Selecione o cadastro duplicado (origem) e o cadastro oficial (destino).');
      return;
    }
    if (String(sourceId) === String(targetId)) {
      setManualStatusMsg('Os dois cadastros precisam ser diferentes.');
      return;
    }
    if (manualCpfConflict && !forceDifferentCpf) {
      setManualStatusMsg('Os CPFs são diferentes. Marque a confirmação abaixo se tiver certeza de que são a mesma pessoa.');
      return;
    }

    setSubmittingManual(true);
    try {
      const res = await fetch('/api/crediario-v2/maintenance/merge-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          sourceId,
          targetId,
          alsoMergeDigifarma: manualBothInDigifarma ? manualAlsoDigifarma : false,
          forceDifferentCpf
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Falha ao unificar os cadastros selecionados.');
      }

      const msg = `Unificado "${selectedSource?.name}" em "${selectedTarget?.name}"${json.digifarmaMerged ? ' (Belinha + Digifarma)' : ''}.`;
      addToast(msg, 'success');
      setManualStatusMsg(msg);
      setSourceId('');
      setTargetId('');
      setManualAlsoDigifarma(false);
      setForceDifferentCpf(false);
      await loadDuplicates();
      onMerged?.();
    } catch (err: any) {
      const errMsg = err?.message || 'Erro ao unificar.';
      setManualStatusMsg(errMsg);
      addToast(errMsg, 'error');
    } finally {
      setSubmittingManual(false);
    }
  };

  const titleId = `${uid}-title`;
  const tabDetectedId = `${uid}-tab-detected`;
  const tabManualId = `${uid}-tab-manual`;
  const tabHistoryId = `${uid}-tab-history`;
  const manualSearchId = `${uid}-manual-search`;
  const sourceSelectId = `${uid}-source-select`;
  const targetSelectId = `${uid}-target-select`;
  const manualDfCbId = `${uid}-manual-df-cb`;
  const forceCpfCbId = `${uid}-force-cpf-cb`;

  const autoPendingCount =
    (data?.autoReport?.totalMergedCards || 0) + (data?.autoReport?.totalMergedCustomers || 0);
  const suggestedTotalCount =
    (data?.suggestedCardPairs?.length || 0) + (data?.suggestedCustomerPairs?.length || 0);
  const detectedBadgeCount = autoPendingCount + suggestedTotalCount;

  const handleTabKeyDown = (e: React.KeyboardEvent, current: 'detected' | 'manual' | 'history') => {
    const order: Array<'detected' | 'manual' | 'history'> = ['detected', 'manual', 'history'];
    const idx = order.indexOf(current);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveTab(order[(idx + 1) % order.length]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveTab(order[(idx - 1 + order.length) % order.length]);
    }
  };

  const renderPairCard = (pairEntityType: 'card' | 'customer', pair: DuplicateSuggestedPair) => {
    const fullKey = `${pairEntityType}:${pair.key}`;
    const swapped = Boolean(swappedKeys[fullKey]);
    const effSource = swapped ? pair.target : pair.source;
    const effTarget = swapped ? pair.source : pair.target;
    const cbId = `${uid}-cb-${fullKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const isConfirming = confirmPairKey === fullKey;
    const isMerging = mergingPairKey === fullKey;

    return (
      <div
        key={fullKey}
        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            {pairEntityType === 'card' ? 'Crediário' : 'Cliente'} • {pair.reasonLabel}
          </span>

          <button
            type="button"
            onClick={() => setSwappedKeys(prev => ({ ...prev, [fullKey]: !prev[fullKey] }))}
            className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            title="Inverter qual cadastro deve permanecer oficial"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Inverter direção
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400">
              Vai sumir (duplicado)
            </p>
            <p className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">{effSource.name}</p>
            <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
              <p>
                ID Local: <strong className="font-mono">{effSource.id}</strong>
                {effSource.digifarma_cliente_id ? (
                  <> • Digifarma <strong className="text-sky-700 dark:text-sky-400">#{effSource.digifarma_cliente_id}</strong></>
                ) : (
                  <> • Sem vínculo Digifarma</>
                )}
              </p>
              <p>
                CPF: {effSource.cpf || '—'} • Tel: {effSource.phone || '—'}
              </p>
              {pairEntityType === 'card' && (
                <p>
                  Saldo em aberto: <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(effSource.principal_balance)}</strong>
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-slate-900 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Vai ficar (oficial)
            </p>
            <p className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">{effTarget.name}</p>
            <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
              <p>
                ID Local: <strong className="font-mono">{effTarget.id}</strong>
                {effTarget.digifarma_cliente_id ? (
                  <> • Digifarma <strong className="text-sky-700 dark:text-sky-400">#{effTarget.digifarma_cliente_id}</strong></>
                ) : (
                  <> • Sem vínculo Digifarma</>
                )}
              </p>
              <p>
                CPF: {effTarget.cpf || '—'} • Tel: {effTarget.phone || '—'}
              </p>
              {pairEntityType === 'card' && (
                <p>
                  Saldo em aberto: <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(effTarget.principal_balance)}</strong>
                </p>
              )}
            </div>
          </div>
        </div>

        {pair.bothInDigifarma && (
          <div className="flex items-start gap-2.5 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/60 rounded-xl p-2.5">
            <input
              id={cbId}
              type="checkbox"
              checked={Boolean(pairIncludeDf[fullKey])}
              onChange={e => setPairIncludeDf(prev => ({ ...prev, [fullKey]: e.target.checked }))}
              className="mt-0.5 w-4 h-4 accent-red-600 rounded"
            />
            <label htmlFor={cbId} className="text-xs font-medium text-sky-900 dark:text-sky-100 cursor-pointer">
              Transferir compras/recebimentos também no <strong>Digifarma</strong> (#{effSource.digifarma_cliente_id} → #{effTarget.digifarma_cliente_id}) e inativar o cadastro duplicado lá
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 min-h-[38px]">
          {!isConfirming ? (
            <button
              type="button"
              onClick={() => setConfirmPairKey(fullKey)}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <GitMerge className="w-3.5 h-3.5" />
              Unificar este par
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 w-full justify-between bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl px-3 py-2">
              <span className="text-xs font-semibold text-red-900 dark:text-red-200">
                Confirmar fusão permanente de &ldquo;{effSource.name}&rdquo; em &ldquo;{effTarget.name}&rdquo;?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isMerging}
                  onClick={() => handleMergePair(pairEntityType, pair)}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isMerging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5" />}
                  Confirmar Unificação
                </button>
                <button
                  type="button"
                  autoFocus
                  disabled={isMerging}
                  onClick={() => setConfirmPairKey(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <dialog
      ref={dialogRef}
      className="crediario-dialog w-[min(96vw,56rem)] max-h-[90dvh] rounded-2xl p-0 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden m-auto"
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as any)}
    >
      {/* Cabeçalho */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            <GitMerge className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 id={titleId} className="text-lg font-black text-slate-900 dark:text-white tracking-tight truncate">
              Unificar Cadastros Duplicados
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Migra compras, pagamentos, recibos e vendas para uma única ficha oficial (Belinha e opcionalmente Digifarma).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadDuplicates}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="Reanalisar duplicados"
            aria-label="Reanalisar duplicados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            aria-label="Fechar janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tablist em linha única (modern-web-guidance: tabs) */}
      <div
        role="tablist"
        aria-label="Seções de unificação"
        className="flex overflow-x-auto whitespace-nowrap border-b border-slate-200 dark:border-slate-800 px-5 gap-2 bg-slate-50/60 dark:bg-slate-950/30 shrink-0"
      >
        <button
          id={tabDetectedId}
          type="button"
          role="tab"
          aria-selected={activeTab === 'detected'}
          onClick={() => setActiveTab('detected')}
          onKeyDown={e => handleTabKeyDown(e, 'detected')}
          className="px-3 py-3 text-sm font-bold border-b-[3px] border-transparent text-slate-600 dark:text-slate-400 aria-[selected=true]:text-red-600 dark:aria-[selected=true]:text-red-400 aria-[selected=true]:border-red-600 inline-flex items-center gap-2 shrink-0 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          <span>Duplicados Detectados</span>
          {detectedBadgeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200">
              {detectedBadgeCount}
            </span>
          )}
        </button>

        <button
          id={tabManualId}
          type="button"
          role="tab"
          aria-selected={activeTab === 'manual'}
          onClick={() => setActiveTab('manual')}
          onKeyDown={e => handleTabKeyDown(e, 'manual')}
          className="px-3 py-3 text-sm font-bold border-b-[3px] border-transparent text-slate-600 dark:text-slate-400 aria-[selected=true]:text-red-600 dark:aria-[selected=true]:text-red-400 aria-[selected=true]:border-red-600 inline-flex items-center gap-2 shrink-0 transition-colors"
        >
          <GitMerge className="w-4 h-4" />
          <span>Unificação Manual</span>
        </button>

        <button
          id={tabHistoryId}
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
          onKeyDown={e => handleTabKeyDown(e, 'history')}
          className="px-3 py-3 text-sm font-bold border-b-[3px] border-transparent text-slate-600 dark:text-slate-400 aria-[selected=true]:text-red-600 dark:aria-[selected=true]:text-red-400 aria-[selected=true]:border-red-600 inline-flex items-center gap-2 shrink-0 transition-colors"
        >
          <History className="w-4 h-4" />
          <span>Última Limpeza</span>
        </button>
      </div>

      {/* Corpo com rolagem */}
      <div className="flex-1 overflow-y-auto">
        {/* Aba 1: Duplicados Detectados */}
        <div role="tabpanel" aria-labelledby={tabDetectedId} hidden={activeTab !== 'detected'}>
          <div className="p-5 space-y-5">
            {loading && !data ? (
              <div className="py-12 flex items-center justify-center gap-2 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-semibold">Analisando cadastros no Belinha...</span>
              </div>
            ) : (
              <>
                {autoPendingCount > 0 && (
                  <section className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/20 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                          {autoPendingCount} unificação(ões) automática(s) pronta(s)
                        </h2>
                        <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
                          Estes cadastros têm correspondência segura e podem ser unificados em um clique.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={runningAuto}
                        onClick={handleRunAutoUnify}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-2 shrink-0 disabled:opacity-60"
                      >
                        {runningAuto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Executar Unificação Automática Agora
                      </button>
                    </div>

                    <ul className="space-y-1.5 text-xs text-emerald-950 dark:text-emerald-100">
                      {(data?.autoReport?.mergedCards || []).map((m, i) => (
                        <li key={`ac-${i}`} className="flex flex-wrap items-center gap-1.5 bg-white/80 dark:bg-slate-900/60 px-2.5 py-1.5 rounded-lg">
                          <span className="font-bold">Crediário #{m.fromCardId} {m.fromName}</span>
                          <span>→</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-300">#{m.toCardId} {m.toName}</span>
                          <span className="text-slate-500">({REASON_LABELS[m.reason] || m.reason})</span>
                        </li>
                      ))}
                      {(data?.autoReport?.mergedCustomers || []).map((m, i) => (
                        <li key={`au-${i}`} className="flex flex-wrap items-center gap-1.5 bg-white/80 dark:bg-slate-900/60 px-2.5 py-1.5 rounded-lg">
                          <span className="font-bold">Cliente &ldquo;{m.fromName}&rdquo;</span>
                          <span>→</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-300">&ldquo;{m.toName}&rdquo;</span>
                          <span className="text-slate-500">({REASON_LABELS[m.reason] || m.reason})</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {suggestedTotalCount > 0 ? (
                  <section className="space-y-3">
                    <div>
                      <h2 className="text-sm font-black text-slate-900 dark:text-white">
                        Pares para Revisão Humana ({suggestedTotalCount})
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Cadastros parecidos que exigem sua confirmação (ex.: dois registros no Digifarma ou telefones diferentes).
                      </p>
                    </div>

                    <div className="space-y-3">
                      {(data?.suggestedCardPairs || []).map(p => renderPairCard('card', p))}
                      {(data?.suggestedCustomerPairs || []).map(p => renderPairCard('customer', p))}
                    </div>
                  </section>
                ) : (
                  autoPendingCount === 0 && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        Nenhuma duplicidade óbvia detectada automaticamente.
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Se houver dois cadastros com nomes diferentes para a mesma pessoa (ex.: mãe e filha), use a aba{' '}
                        <button
                          type="button"
                          onClick={() => setActiveTab('manual')}
                          className="font-bold text-red-600 dark:text-red-400 underline"
                        >
                          Unificação Manual
                        </button>
                        {' '}para uni-los diretamente.
                      </p>
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>

        {/* Aba 2: Unificação Manual */}
        <div role="tabpanel" aria-labelledby={tabManualId} hidden={activeTab !== 'manual'}>
          <div className="p-5">
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <fieldset className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5">
                <legend className="px-1.5 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Tipo de cadastro
                </legend>
                <div className="flex flex-wrap gap-5 pt-1">
                  <div className="flex items-center gap-2">
                    <input
                      id={`${uid}-type-card`}
                      type="radio"
                      name={`${uid}-entity-type`}
                      value="card"
                      checked={entityType === 'card'}
                      onChange={() => {
                        setEntityType('card');
                        setSourceId('');
                        setTargetId('');
                        setForceDifferentCpf(false);
                        setManualStatusMsg('');
                      }}
                      className="w-4 h-4 accent-red-600"
                    />
                    <label htmlFor={`${uid}-type-card`} className="text-sm font-bold cursor-pointer">
                      Crediário (Contas BelaFarma)
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id={`${uid}-type-cust`}
                      type="radio"
                      name={`${uid}-entity-type`}
                      value="customer"
                      checked={entityType === 'customer'}
                      onChange={() => {
                        setEntityType('customer');
                        setSourceId('');
                        setTargetId('');
                        setForceDifferentCpf(false);
                        setManualStatusMsg('');
                      }}
                      className="w-4 h-4 accent-red-600"
                    />
                    <label htmlFor={`${uid}-type-cust`} className="text-sm font-bold cursor-pointer">
                      Cadastro de Clientes (CRM / PDV)
                    </label>
                  </div>
                </div>
              </fieldset>

              <search className="block space-y-1.5">
                <label htmlFor={manualSearchId} className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                  Filtrar cadastros por nome, CPF, telefone ou ID Digifarma
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id={manualSearchId}
                    type="search"
                    value={manualSearch}
                    onChange={e => setManualSearch(e.target.value)}
                    placeholder="Ex.: Reni, Rosani, Rosangela, Yasmin..."
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:border-red-500"
                  />
                </div>
              </search>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor={sourceSelectId} className="block text-xs font-black uppercase text-red-600 dark:text-red-400">
                    1. Cadastro Duplicado (vai sumir) *
                  </label>
                  <select
                    id={sourceSelectId}
                    name="sourceId"
                    value={sourceId}
                    onChange={e => {
                      setSourceId(e.target.value);
                      setForceDifferentCpf(false);
                      setManualStatusMsg('');
                    }}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold outline-none focus:border-red-500"
                  >
                    <option value="">-- Selecione o duplicado ({manualOptions.length}) --</option>
                    {manualOptions.map(opt => (
                      <option key={`src-${opt.id}`} value={String(opt.id)}>
                        {opt.name}
                        {opt.digifarma_cliente_id ? ` [DF #${opt.digifarma_cliente_id}]` : ' [Sem DF]'}
                        {entityType === 'card' && Number(opt.principal_balance || 0) > 0
                          ? ` — ${formatCurrency(opt.principal_balance)}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor={targetSelectId} className="block text-xs font-black uppercase text-emerald-700 dark:text-emerald-400">
                    2. Cadastro Oficial (vai ficar) *
                  </label>
                  <select
                    id={targetSelectId}
                    name="targetId"
                    value={targetId}
                    onChange={e => {
                      setTargetId(e.target.value);
                      setForceDifferentCpf(false);
                      setManualStatusMsg('');
                    }}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Selecione o oficial ({manualOptions.length}) --</option>
                    {manualOptions.map(opt => (
                      <option key={`tgt-${opt.id}`} value={String(opt.id)}>
                        {opt.name}
                        {opt.digifarma_cliente_id ? ` [DF #${opt.digifarma_cliente_id}]` : ' [Sem DF]'}
                        {entityType === 'card' && Number(opt.principal_balance || 0) > 0
                          ? ` — ${formatCurrency(opt.principal_balance)}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(selectedSource || selectedTarget) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 p-3 text-xs space-y-1">
                    <p className="font-black text-red-700 dark:text-red-400 uppercase text-[10px]">Resumo Origem (será removida)</p>
                    {selectedSource ? (
                      <>
                        <p className="font-bold text-sm text-slate-900 dark:text-white">{selectedSource.name}</p>
                        <p>ID: {selectedSource.id} • Digifarma: {selectedSource.digifarma_cliente_id ? `#${selectedSource.digifarma_cliente_id}` : 'Nenhum'}</p>
                        <p>CPF: {selectedSource.cpf || '—'} • Tel: {selectedSource.phone || '—'}</p>
                        {entityType === 'card' && <p>Saldo: <strong>{formatCurrency(selectedSource.principal_balance)}</strong></p>}
                      </>
                    ) : (
                      <p className="text-slate-400">Nenhum cadastro selecionado.</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 text-xs space-y-1">
                    <p className="font-black text-emerald-700 dark:text-emerald-400 uppercase text-[10px]">Resumo Destino (será mantida)</p>
                    {selectedTarget ? (
                      <>
                        <p className="font-bold text-sm text-slate-900 dark:text-white">{selectedTarget.name}</p>
                        <p>ID: {selectedTarget.id} • Digifarma: {selectedTarget.digifarma_cliente_id ? `#${selectedTarget.digifarma_cliente_id}` : 'Nenhum'}</p>
                        <p>CPF: {selectedTarget.cpf || '—'} • Tel: {selectedTarget.phone || '—'}</p>
                        {entityType === 'card' && <p>Saldo: <strong>{formatCurrency(selectedTarget.principal_balance)}</strong></p>}
                      </>
                    ) : (
                      <p className="text-slate-400">Nenhum cadastro selecionado.</p>
                    )}
                  </div>
                </div>
              )}

              {manualBothInDigifarma && selectedSource && selectedTarget && (
                <div className="flex items-start gap-2.5 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/60 rounded-xl p-3">
                  <input
                    id={manualDfCbId}
                    type="checkbox"
                    checked={manualAlsoDigifarma}
                    onChange={e => setManualAlsoDigifarma(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-red-600 rounded"
                  />
                  <label htmlFor={manualDfCbId} className="text-xs font-medium text-sky-900 dark:text-sky-100 cursor-pointer">
                    <strong>Também unificar no Digifarma:</strong> transferir compras/recebimentos do cliente Digifarma{' '}
                    <strong>#{selectedSource.digifarma_cliente_id}</strong> para <strong>#{selectedTarget.digifarma_cliente_id}</strong>{' '}
                    e marcar o duplicado como inativo/bloqueado lá.
                  </label>
                </div>
              )}

              {manualCpfConflict && (
                <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-xl p-3">
                  <input
                    id={forceCpfCbId}
                    type="checkbox"
                    checked={forceDifferentCpf}
                    onChange={e => setForceDifferentCpf(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-red-600 rounded"
                  />
                  <label htmlFor={forceCpfCbId} className="text-xs font-semibold text-amber-950 dark:text-amber-200 cursor-pointer">
                    Atenção: os dois registros têm CPFs diferentes ({selectedSource?.cpf} vs {selectedTarget?.cpf}).
                    Marque aqui somente se confirmar que pertencem à mesma pessoa/conta familiar.
                  </label>
                </div>
              )}

              <div role="status" aria-live="polite" className="min-h-[20px] text-xs font-semibold text-red-600 dark:text-red-400">
                {manualStatusMsg}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    const prevSrc = sourceId;
                    setSourceId(targetId);
                    setTargetId(prevSrc);
                  }}
                  disabled={!sourceId && !targetId}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  Inverter Origem e Destino
                </button>

                <button
                  type="submit"
                  disabled={submittingManual}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm disabled:opacity-60"
                >
                  {submittingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                  Unificar Cadastros Selecionados
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Aba 3: Última Limpeza Automática */}
        <div role="tabpanel" aria-labelledby={tabHistoryId} hidden={activeTab !== 'history'}>
          <div className="p-5 space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Última unificação registrada</p>
                <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                  {formatDateTimeBR(data?.lastUnifyReport?.executedAt)}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold">
                <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  Crediário: {data?.lastUnifyReport?.mergedCards?.length || 0} fusão(ões)
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  Clientes: {data?.lastUnifyReport?.mergedCustomers?.length || 0} fusão(ões)
                </span>
              </div>
            </div>

            {(!data?.lastUnifyReport ||
              ((data.lastUnifyReport.mergedCards?.length || 0) === 0 &&
                (data.lastUnifyReport.mergedCustomers?.length || 0) === 0)) ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
                Ainda não há histórico de fusões gravadas neste banco de dados.
              </p>
            ) : (
              <div className="space-y-4">
                {(data.lastUnifyReport.mergedCards?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Contas de Crediário Unificadas
                    </h2>
                    <ul className="space-y-1.5 text-xs">
                      {data.lastUnifyReport.mergedCards!.map((m, idx) => (
                        <li
                          key={`hc-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 bg-white dark:bg-slate-900"
                        >
                          <span>
                            <span className="text-red-600 dark:text-red-400 font-bold">#{m.fromCardId} {m.fromName}</span>
                            {' → '}
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">#{m.toCardId} {m.toName}</span>
                          </span>
                          <span className="text-slate-500">{REASON_LABELS[m.reason] || m.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(data.lastUnifyReport.mergedCustomers?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Cadastros de Clientes Unificados
                    </h2>
                    <ul className="space-y-1.5 text-xs">
                      {data.lastUnifyReport.mergedCustomers!.map((m, idx) => (
                        <li
                          key={`hu-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 bg-white dark:bg-slate-900"
                        >
                          <span>
                            <span className="text-red-600 dark:text-red-400 font-bold">{m.fromName}</span>
                            {' → '}
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">{m.toName}</span>
                          </span>
                          <span className="text-slate-500">{REASON_LABELS[m.reason] || m.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
};
