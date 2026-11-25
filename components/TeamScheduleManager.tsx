import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  DollarSign,
  Info,
  Loader2,
  Printer,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Users as UsersIcon
} from 'lucide-react';
import { User, UserRole } from '../types';
import { useToast } from './ToastContext';
import {
  analyzeTeamWeek,
  buildDefaultTeamScheduleConfig,
  computeTeamFinance,
  fmtBRL,
  fmtHours,
  fmtMin,
  getActiveRoster,
  getCurrentMondayYMD,
  getCurrentWeekType,
  getTodayDayKey,
  isWorkingAt,
  shiftMinutes,
  TEAM_DAY_KEYS,
  TEAM_DAYS,
  TEAM_PRESETS,
  TeamDayKey,
  TeamFinanceConfig,
  TeamMemberKey,
  TeamRegime,
  TeamScheduleConfig,
  TeamShiftCell,
  TeamWeekSchedule
} from '../utils/teamSchedule';

interface TeamScheduleManagerProps {
  user: User;
}

type TabId = 'weekA' | 'weekB' | 'coverage' | 'finance' | 'guide';

interface PendingDialogAction {
  type: 'preset' | 'reset';
  presetId: string;
  title: string;
  description: string;
}

interface StoreMetrics {
  monthlyRevenueAvg: number;
  deliveriesPerDayAvg: number;
  sampleMonths: number;
}

function cloneObj<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

const WEDNESDAY_WHATSAPP_SCRIPT =
  'Olá! Hoje temos rotas econômicas de entrega saindo da BelaFarma às 13:00 e às 18:30. Se precisar receber com urgência imediata fora desses horários, consigo chamar um entregador por aplicativo agora mesmo (taxa conforme distância). Qual opção fica melhor para você?';

export const TeamScheduleManager: React.FC<TeamScheduleManagerProps> = ({ user }) => {
  const { addToast } = useToast();
  const isAdmin = user.role === UserRole.ADM;

  const [config, setConfig] = useState<TeamScheduleConfig>(() => buildDefaultTeamScheduleConfig());
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabId>('weekA');
  const [covWeek, setCovWeek] = useState<'A' | 'B'>('A');
  const [metrics, setMetrics] = useState<StoreMetrics | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingDialogAction | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [liveStatus, setLiveStatus] = useState<string>('');

  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const pendingActionRef = useRef<PendingDialogAction | null>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  pendingActionRef.current = pendingAction;

  const visibleTabs = useMemo(() => {
    const base: Array<{ id: TabId; label: string }> = [
      { id: 'weekA', label: 'Escala Semana A' },
      { id: 'weekB', label: 'Escala Semana B' },
      { id: 'coverage', label: 'Cobertura Hora a Hora' }
    ];
    if (isAdmin) {
      base.push({ id: 'finance', label: 'Simulador Financeiro' });
    }
    base.push({ id: 'guide', label: 'Guia CLT, CRF-MG & Entregas' });
    return base;
  }, [isAdmin]);

  // Carrega configuração persistida do backend
  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/team-schedule');
        if (res.ok) {
          const data = await res.json();
          if (active && data?.success && data.config) {
            setConfig(data.config);
            const wk = getCurrentWeekType(data.config.weekAStartDate);
            setCovWeek(wk);
          }
        } else {
          if (active) {
            addToast('Não foi possível carregar a escala salva; exibindo modelo padrão.', 'warning');
          }
        }
      } catch {
        if (active) {
          addToast('Falha de rede ao carregar escala; exibindo modelo padrão local.', 'warning');
        }
      } finally {
        if (active) setLoading(false);
      }

      if (isAdmin) {
        try {
          const resM = await fetch('/api/team-schedule/metrics');
          if (resM.ok) {
            const dataM = await resM.json();
            if (active && dataM?.success && dataM.metrics) {
              setMetrics(dataM.metrics);
            }
          }
        } catch {
          // Métricas são auxiliares; silencioso em caso de indisponibilidade
        }
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, [isAdmin, addToast]);

  // Garante tab válida caso perfil não seja ADM
  useEffect(() => {
    if (!isAdmin && activeTab === 'finance') {
      setActiveTab('weekA');
    }
  }, [isAdmin, activeTab]);

  // Sincroniza hidden="until-found" e listener beforematch nos tabpanels
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const t of visibleTabs) {
      const panelEl = panelRefs.current[t.id];
      if (!panelEl) continue;
      if (t.id === activeTab) {
        panelEl.removeAttribute('hidden');
      } else {
        panelEl.setAttribute('hidden', 'until-found');
      }
      const onBeforeMatch = () => {
        setActiveTab(t.id);
      };
      panelEl.addEventListener('beforematch', onBeforeMatch);
      cleanups.push(() => panelEl.removeEventListener('beforematch', onBeforeMatch));
    }
    return () => cleanups.forEach(fn => fn());
  }, [activeTab, visibleTabs]);

  // Modal nativo <dialog>: returnValue + fallback closedby (Safari/browsers sem closedBy)
  useEffect(() => {
    const dialog = confirmDialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      const decision = dialog.returnValue;
      dialog.returnValue = '';
      const action = pendingActionRef.current;
      setPendingAction(null);
      if (decision === 'confirm' && action) {
        applyPresetConfirmed(action.presetId);
      }
    };

    dialog.addEventListener('close', handleClose);

    let cleanupPointer: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      const onDown = (e: PointerEvent) => {
        pressedOutside = outside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && outside(e)) dialog.close('');
      };
      dialog.addEventListener('pointerdown', onDown);
      dialog.addEventListener('pointerup', onUp);
      cleanupPointer = () => {
        dialog.removeEventListener('pointerdown', onDown);
        dialog.removeEventListener('pointerup', onUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (cleanupPointer) cleanupPointer();
    };
  }, []);

  const regime: TeamRegime = config.finance?.regime || config.meta?.regime || 'clt_integral';
  const qtdContratados: 1 | 2 = (Number(config.finance?.qtdContratados ?? config.meta?.qtdContratados) === 2 ? 2 : 1);
  const activeRoster = useMemo(
    () => getActiveRoster(config.roster, qtdContratados),
    [config.roster, qtdContratados]
  );

  const analysisA = useMemo(
    () => analyzeTeamWeek(config.weekA, config.roster, regime, qtdContratados),
    [config.weekA, config.roster, regime, qtdContratados]
  );
  const analysisB = useMemo(
    () => analyzeTeamWeek(config.weekB, config.roster, regime, qtdContratados),
    [config.weekB, config.roster, regime, qtdContratados]
  );
  const financeBreakdown = useMemo(
    () => (config.finance ? computeTeamFinance(config.finance) : null),
    [config.finance]
  );

  const currentWeekType = useMemo(
    () => getCurrentWeekType(config.weekAStartDate),
    [config.weekAStartDate]
  );
  const todayKey = useMemo(() => getTodayDayKey(), []);
  const todayLabel = TEAM_DAYS[TEAM_DAY_KEYS.indexOf(todayKey)];

  const todaySummary = useMemo(() => {
    const currentWeek = currentWeekType === 'A' ? config.weekA : config.weekB;
    const working: string[] = [];
    const off: string[] = [];
    for (const member of activeRoster) {
      const cell = currentWeek[member.key]?.[todayKey];
      const shortName = member.name.split(' ')[0];
      if (!cell || cell.off) {
        off.push(shortName);
      } else {
        const alm = cell.lStart && cell.lEnd ? ` (alm. ${cell.lStart}–${cell.lEnd})` : '';
        working.push(`${shortName} ${cell.start}–${cell.end}${alm}`);
      }
    }
    return { working, off };
  }, [activeRoster, config.weekA, config.weekB, currentWeekType, todayKey]);

  const applyPresetConfirmed = (presetId: string) => {
    const preset = TEAM_PRESETS[presetId];
    if (!preset) return;
    setConfig(prev => ({
      ...prev,
      presetId: preset.id,
      weekA: cloneObj(preset.weekA),
      weekB: cloneObj(preset.weekB),
      finance: cloneObj(preset.finance),
      meta: {
        regime: preset.finance.regime,
        qtdContratados: preset.finance.qtdContratados
      }
    }));
    setFieldErrors({});
    setIsDirty(true);
    setLiveStatus(`Cenário aplicado: ${preset.label}. Clique em Salvar Escala para gravar no sistema.`);
    addToast(`Cenário "${preset.shortTitle}" carregado na tela. Clique em Salvar para confirmar.`, 'info');
  };

  const requestPresetConfirmation = (presetId: string, isReset = false) => {
    if (!isAdmin) return;
    const preset = TEAM_PRESETS[presetId];
    if (!preset) return;
    setPendingAction({
      type: isReset ? 'reset' : 'preset',
      presetId,
      title: isReset ? 'Restaurar horários originais do cenário?' : `Aplicar "${preset.shortTitle}"?`,
      description: `Isso substituirá os turnos editados nas Semanas A e B${isAdmin ? ' e os parâmetros financeiros' : ''} pelos valores do cenário "${preset.label}". Os nomes dos colaboradores e a data base da Semana A serão mantidos.`
    });
    confirmDialogRef.current?.showModal();
  };

  const handleSave = async () => {
    if (!isAdmin || saving) return;
    try {
      setSaving(true);
      const res = await fetch('/api/team-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetId: config.presetId,
          weekAStartDate: config.weekAStartDate,
          roster: config.roster,
          weekA: config.weekA,
          weekB: config.weekB,
          finance: config.finance || TEAM_PRESETS.clt_44_seg_sab.finance
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Falha ao salvar escala.');
      }
      setConfig(data.config);
      setIsDirty(false);
      setLiveStatus('Escala oficial salva no banco de dados com sucesso.');
      addToast('Escala oficial salva com sucesso!', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Erro ao salvar escala no servidor.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateShiftCell = (
    weekKey: 'A' | 'B',
    personKey: TeamMemberKey,
    dayKey: TeamDayKey,
    field: keyof TeamShiftCell,
    value: string | boolean
  ) => {
    if (!isAdmin) return;
    setConfig(prev => {
      const targetWeekKey = weekKey === 'A' ? 'weekA' : 'weekB';
      const nextWeek: TeamWeekSchedule = {
        ...prev[targetWeekKey],
        [personKey]: {
          ...prev[targetWeekKey][personKey],
          [dayKey]: {
            ...prev[targetWeekKey][personKey][dayKey],
            [field]: value
          }
        }
      };
      return {
        ...prev,
        [targetWeekKey]: nextWeek
      };
    });
    setIsDirty(true);
  };

  const updateMemberName = (personKey: TeamMemberKey, nextName: string) => {
    if (!isAdmin) return;
    setConfig(prev => ({
      ...prev,
      roster: prev.roster.map(m => (m.key === personKey ? { ...m, name: nextName } : m))
    }));
    setIsDirty(true);
  };

  const updateFinanceField = <K extends keyof TeamFinanceConfig>(field: K, value: TeamFinanceConfig[K]) => {
    if (!isAdmin) return;
    setConfig(prev => {
      const curFin = prev.finance || cloneObj(TEAM_PRESETS.clt_44_seg_sab.finance);
      const nextFin = { ...curFin, [field]: value };
      return {
        ...prev,
        finance: nextFin,
        meta: {
          regime: nextFin.regime,
          qtdContratados: nextFin.qtdContratados
        }
      };
    });
    setIsDirty(true);
  };

  const validateNumericField = (
    key: string,
    label: string,
    rawVal: string,
    min: number,
    max: number,
    inputEl: HTMLInputElement
  ) => {
    const trimmed = rawVal.trim();
    const num = Number(trimmed);
    let err = '';
    if (trimmed === '' || Number.isNaN(num)) {
      err = `Informe um número válido para ${label}.`;
    } else if (num < min || num > max) {
      err = `${label} deve ficar entre ${min} e ${max}.`;
    }
    inputEl.setCustomValidity(err);
    setFieldErrors(prev => ({ ...prev, [key]: err }));
  };

  const handleTabSelect = (tabId: TabId, focusTab = false) => {
    setActiveTab(tabId);
    const btn = tabButtonRefs.current[tabId];
    if (btn) {
      btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (focusTab) btn.focus();
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (index + 1) % visibleTabs.length;
    else if (e.key === 'ArrowLeft') nextIdx = (index - 1 + visibleTabs.length) % visibleTabs.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = visibleTabs.length - 1;

    if (nextIdx !== null) {
      e.preventDefault();
      handleTabSelect(visibleTabs[nextIdx].id, true);
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(WEDNESDAY_WHATSAPP_SCRIPT);
      addToast('Script de entregas da Terça-feira copiado!', 'success');
    } catch {
      addToast('Não foi possível copiar automaticamente.', 'warning');
    }
  };

  const avgEd = (analysisA.personHours.Edevaldo + analysisB.personHours.Edevaldo) / 2;
  const avgFarm = (analysisA.personHours.Farmaceutica + analysisB.personHours.Farmaceutica) / 2;
  const avgC1 = (analysisA.personHours.Contratado1 + analysisB.personHours.Contratado1) / 2;
  const avgC2 = qtdContratados === 2 ? (analysisA.personHours.Contratado2 + analysisB.personHours.Contratado2) / 2 : null;
  const totalGaps = analysisA.gapSlots + analysisB.gapSlots;
  const minRT = Math.min(analysisA.rtDaysSegSex, analysisB.rtDaysSegSex);
  const hiredLimit = regime === 'clt_integral' ? 44 : 30;
  const hiredWithinLimit = avgC1 <= hiredLimit + 0.01 && (avgC2 === null || avgC2 <= hiredLimit + 0.01);

  const renderWeekEditor = (weekKey: 'A' | 'B') => {
    const weekObj = weekKey === 'A' ? config.weekA : config.weekB;
    const analysis = weekKey === 'A' ? analysisA : analysisB;
    const capId = `ts-cap-week-${weekKey}`;

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {weekKey === 'A'
                ? 'Semana A — Farmacêutica folga Sáb + Dom inteiros · Edevaldo folga Terça'
                : 'Semana B — Edevaldo folga Terça + Sáb tarde + Dom · Farmacêutica ganha tardes livres'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {isAdmin
                ? 'Ajuste horários de entrada, saída e intervalo ou marque Folga. Os alertas CLT e CRF-MG atualizam na hora.'
                : 'Visualização da escala oficial vigente para consulta e impressão.'}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold self-start ${
              analysis.gapSlots === 0
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800'
            }`}
          >
            {analysis.gapSlots === 0 ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            <span>{analysis.gapSlots === 0 ? '0 buracos na loja' : `${analysis.gapSlots * 10} min descobertos`}</span>
          </span>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby={capId}
          className="ts-table-region rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          <table className="w-full text-left">
            <caption id={capId} className="sr-only">
              Escala semanal da Semana {weekKey}
            </caption>
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                  Colaborador
                </th>
                {TEAM_DAYS.map(d => (
                  <th
                    key={d}
                    scope="col"
                    className="px-2.5 py-2.5 text-xs font-bold uppercase tracking-wide border-b border-slate-200 dark:border-slate-700 whitespace-nowrap"
                  >
                    {d}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide border-b border-slate-200 dark:border-slate-700 whitespace-nowrap text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {activeRoster.map(member => {
                let totalMin = 0;
                return (
                  <tr key={member.key} className="border-b border-slate-200 dark:border-slate-800 last:border-b-0">
                    <th
                      scope="row"
                      className="px-3 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap align-top"
                    >
                      <div>{member.name}</div>
                      <div className="text-xs font-normal text-slate-500 dark:text-slate-400">{member.roleLabel}</div>
                    </th>
                    {TEAM_DAY_KEYS.map((dk, idx) => {
                      const cell = weekObj[member.key]?.[dk] || { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' };
                      const mins = shiftMinutes(cell);
                      totalMin += mins;
                      const idBase = `ts-${weekKey}-${member.key}-${dk}`;

                      return (
                        <td key={dk} data-label={TEAM_DAYS[idx]} className="px-2.5 py-2.5 align-top text-xs">
                          {isAdmin ? (
                            <div className="space-y-1.5 min-w-[132px]">
                              <label htmlFor={`${idBase}-off`} className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  id={`${idBase}-off`}
                                  name={`${idBase}-off`}
                                  checked={cell.off}
                                  onChange={e => updateShiftCell(weekKey, member.key, dk, 'off', e.target.checked)}
                                  className="w-4 h-4 rounded accent-red-600"
                                />
                                <span>Folga</span>
                              </label>

                              {cell.off ? (
                                <div className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-center">
                                  FOLGA
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="grid grid-cols-2 gap-1">
                                    <div>
                                      <label htmlFor={`${idBase}-start`} className="block text-xs text-slate-500 dark:text-slate-400">
                                        Ent.
                                      </label>
                                      <input
                                        type="time"
                                        id={`${idBase}-start`}
                                        name={`${idBase}-start`}
                                        value={cell.start}
                                        onChange={e => updateShiftCell(weekKey, member.key, dk, 'start', e.target.value)}
                                        className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs tabular-nums"
                                      />
                                    </div>
                                    <div>
                                      <label htmlFor={`${idBase}-end`} className="block text-xs text-slate-500 dark:text-slate-400">
                                        Saída
                                      </label>
                                      <input
                                        type="time"
                                        id={`${idBase}-end`}
                                        name={`${idBase}-end`}
                                        value={cell.end}
                                        onChange={e => updateShiftCell(weekKey, member.key, dk, 'end', e.target.value)}
                                        className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs tabular-nums"
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1">
                                    <div>
                                      <label htmlFor={`${idBase}-ls`} className="block text-xs text-slate-500 dark:text-slate-400">
                                        Alm. I
                                      </label>
                                      <input
                                        type="time"
                                        id={`${idBase}-ls`}
                                        name={`${idBase}-ls`}
                                        value={cell.lStart}
                                        onChange={e => updateShiftCell(weekKey, member.key, dk, 'lStart', e.target.value)}
                                        className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs tabular-nums"
                                      />
                                    </div>
                                    <div>
                                      <label htmlFor={`${idBase}-le`} className="block text-xs text-slate-500 dark:text-slate-400">
                                        Alm. F
                                      </label>
                                      <input
                                        type="time"
                                        id={`${idBase}-le`}
                                        name={`${idBase}-le`}
                                        value={cell.lEnd}
                                        onChange={e => updateShiftCell(weekKey, member.key, dk, 'lEnd', e.target.value)}
                                        className="w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs tabular-nums"
                                      />
                                    </div>
                                  </div>
                                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                                    {fmtHours(mins / 60)}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : cell.off ? (
                            <span className="inline-block px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                              FOLGA
                            </span>
                          ) : (
                            <div className="space-y-0.5 tabular-nums">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {cell.start}–{cell.end}
                              </div>
                              {cell.lStart && cell.lEnd && (
                                <div className="text-slate-500 dark:text-slate-400">
                                  Alm. {cell.lStart}–{cell.lEnd}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td data-label="Total" className="px-3 py-3 text-right font-bold text-sm text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                      {fmtHours(totalMin / 60)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Auditor Automático CLT &amp; CRF-MG — Semana {weekKey}</span>
          </h3>
          <ul className="space-y-1.5 text-sm">
            {analysis.alerts.map((alert, idx) => (
              <li
                key={idx}
                className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs sm:text-sm ${
                  alert.level === 'danger'
                    ? 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800'
                    : alert.level === 'warn'
                    ? 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800'
                }`}
              >
                {alert.level === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{alert.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-600 dark:text-slate-300 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-medium">Carregando módulo Escala &amp; Equipe...</span>
      </div>
    );
  }

  return (
    <>
      <div className="team-schedule-no-print space-y-5 max-w-7xl mx-auto">
        {/* Cabeçalho + Banner Hoje na Farmácia */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800 mb-2">
                <CalendarClock className="w-3.5 h-3.5" />
                <span>Semana Vigente Hoje: Semana {currentWeekType}</span>
                {isDirty && isAdmin && <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500 text-white text-xs">Não salvo</span>}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                Escala &amp; Equipe — BelaFarma
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Funcionamento: <strong>Seg–Sáb 07:30–20:00</strong> e <strong>Dom 07:30–13:00</strong> (80h30/sem)
                {config.updatedAt ? ` · Última gravação por ${config.updatedBy || 'Admin'}` : ' · Modelo inicial pronto'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => requestPresetConfirmation(config.presetId, true)}
                  title="Restaurar horários originais do cenário selecionado"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Restaurar Cenário</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => window.print()}
                title="Imprimir Escala Quinzenal A + B"
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Escala (A + B)</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  title="Salvar escala oficial no banco de dados"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold shadow-sm cursor-pointer"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{saving ? 'Salvando...' : 'Salvar Escala Oficial'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Resumo do dia de hoje */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-2 text-sm">
            <div>
              <strong className="text-slate-900 dark:text-slate-100">
                Hoje ({todayLabel} · Semana {currentWeekType}):
              </strong>{' '}
              <span className="text-slate-700 dark:text-slate-300">
                {todaySummary.working.length > 0 ? todaySummary.working.join(' · ') : 'Sem escalados'}
              </span>
            </div>
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Folga hoje: <strong>{todaySummary.off.length > 0 ? todaySummary.off.join(', ') : 'Ninguém'}</strong>
            </div>
          </div>

          {/* Barra de Cenários Prontos e Nomes/Data Base (Apenas ADM) */}
          {isAdmin && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                  Cenários Prontos para Simular / Aplicar
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5" role="group" aria-label="Cenários prontos de equipe">
                  {Object.values(TEAM_PRESETS).map(preset => {
                    const selected = config.presetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => requestPresetConfirmation(preset.id, false)}
                        className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-red-600 text-white border-red-600 shadow-sm'
                            : 'bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-red-400'
                        }`}
                      >
                        <span className="block text-sm font-semibold">{preset.shortTitle}</span>
                        <span className={`block text-xs mt-0.5 ${selected ? 'text-red-100' : 'text-slate-500 dark:text-slate-400'}`}>
                          {preset.subtitle}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 bg-slate-50 dark:bg-slate-950/40">
                <legend className="text-xs font-bold uppercase tracking-wide px-1.5 text-slate-600 dark:text-slate-400">
                  Identificação da Equipe &amp; Início da Quinzena
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-1">
                  <div>
                    <label htmlFor="ts-week-a-start" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Início da Semana A (Seg)
                    </label>
                    <input
                      type="date"
                      id="ts-week-a-start"
                      name="weekAStartDate"
                      value={config.weekAStartDate}
                      onChange={e => {
                        setConfig(prev => ({ ...prev, weekAStartDate: e.target.value || getCurrentMondayYMD() }));
                        setIsDirty(true);
                      }}
                      className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                    />
                  </div>
                  {activeRoster.map(member => (
                    <div key={member.key}>
                      <label htmlFor={`ts-name-${member.key}`} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {member.roleLabel}
                      </label>
                      <input
                        type="text"
                        id={`ts-name-${member.key}`}
                        name={`name_${member.key}`}
                        value={member.name}
                        onChange={e => updateMemberName(member.key, e.target.value)}
                        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          <div role="status" aria-live="polite" className="sr-only">
            {liveStatus}
          </div>
        </section>

        {/* 4 KPIs */}
        <section aria-label="Indicadores da escala" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {isAdmin && financeBreakdown ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Custo Real Mensal (c/ Provisões)</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {fmtBRL(financeBreakdown.custoTotalReal)}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                    financeBreakdown.margemTeto >= 0
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300'
                  }`}
                >
                  {financeBreakdown.margemTeto >= 0 ? '✓ Dentro do teto' : '✕ Acima do teto'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {financeBreakdown.pctFat.toFixed(1)}% do faturamento
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Horário de Funcionamento</span>
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">80h30 / semana</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Seg–Sáb 07:30–20:00 · Dom 07:30–13:00</p>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Média Quinzenal — Sócios</span>
              <UsersIcon className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {config.roster[0].name.split(' ')[0]} {fmtHours(avgEd)} · {config.roster[1].name.split(' ')[0]} {fmtHours(avgFarm)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Redução média de ~40% vs. ~75–80h/sem</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Jornada do(s) Contratado(s)</span>
              <Clock className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {avgC2 !== null ? `${fmtHours(avgC1)} + ${fmtHours(avgC2)} / sem` : `${fmtHours(avgC1)} / sem`}
            </p>
            <div className="pt-1">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                  hiredWithinLimit
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300'
                }`}
              >
                {hiredWithinLimit ? `✓ Limite ${hiredLimit}h respeitado` : `✕ Excede limite de ${hiredLimit}h`}
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Saúde da Escala (Cobertura + CRF)</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {totalGaps * 10} min vazio · {minRT}/5 dias RT
            </p>
            <div className="pt-1">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                  totalGaps === 0 && minRT === 5
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300'
                }`}
              >
                {totalGaps === 0 && minRT === 5 ? '✓ 100% coberta e CRF protegido' : '✕ Verificar alertas A/B'}
              </span>
            </div>
          </div>
        </section>

        {/* Abas Principais */}
        <main className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="ts-tabs">
            <div
              className="ts-tablist"
              {...({ focusgroup: 'tablist nomemory' } as any)}
              role="tablist"
              aria-label="Seções de Escala e Equipe"
            >
              {visibleTabs.map((tab, idx) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={el => {
                      tabButtonRefs.current[tab.id] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`ts-tab-${tab.id}`}
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    {...(selected ? ({ focusgroupstart: '' } as any) : {})}
                    onClick={() => handleTabSelect(tab.id, false)}
                    onKeyDown={e => handleTabKeyDown(e, idx)}
                    className="ts-tab text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="ts-tabs-panels">
              {/* Painel Semana A */}
              <div
                ref={el => {
                  panelRefs.current.weekA = el;
                }}
                role="tabpanel"
                id="ts-panel-weekA"
                aria-labelledby="ts-tab-weekA"
                tabIndex={activeTab === 'weekA' ? 0 : undefined}
                hidden={activeTab !== 'weekA'}
              >
                <div className="pt-5 space-y-4">{renderWeekEditor('A')}</div>
              </div>

              {/* Painel Semana B */}
              <div
                ref={el => {
                  panelRefs.current.weekB = el;
                }}
                role="tabpanel"
                id="ts-panel-weekB"
                aria-labelledby="ts-tab-weekB"
                tabIndex={activeTab === 'weekB' ? 0 : undefined}
                hidden={activeTab !== 'weekB'}
              >
                <div className="pt-5 space-y-4">{renderWeekEditor('B')}</div>
              </div>

              {/* Painel Cobertura Hora a Hora */}
              <div
                ref={el => {
                  panelRefs.current.coverage = el;
                }}
                role="tabpanel"
                id="ts-panel-coverage"
                aria-labelledby="ts-tab-coverage"
                tabIndex={activeTab === 'coverage' ? 0 : undefined}
                hidden={activeTab !== 'coverage'}
              >
                <div className="pt-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        Cobertura de Pessoas (Blocos de 30 min)
                      </h2>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Faixas com selo <strong>PICO ENTREGAS</strong> marcam os horários de maior demanda no WhatsApp (12h–16h e 19h–20h).
                      </p>
                    </div>

                    <form className="ts-form" onSubmit={e => e.preventDefault()}>
                      <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                        <legend className="text-xs font-bold px-1 text-slate-600 dark:text-slate-400">
                          Semana exibida
                        </legend>
                        <div className="flex items-center gap-4">
                          <label htmlFor="ts-cov-a" className="inline-flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="radio"
                              id="ts-cov-a"
                              name="covWeek"
                              value="A"
                              checked={covWeek === 'A'}
                              onChange={() => setCovWeek('A')}
                            />
                            <span>Semana A</span>
                          </label>
                          <label htmlFor="ts-cov-b" className="inline-flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="radio"
                              id="ts-cov-b"
                              name="covWeek"
                              value="B"
                              checked={covWeek === 'B'}
                              onChange={() => setCovWeek('B')}
                            />
                            <span>Semana B</span>
                          </label>
                        </div>
                      </fieldset>
                    </form>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-md bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800 font-semibold">
                      0 pessoas = Loja descoberta (ERRO)
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 font-semibold">
                      1 pessoa = Turno solo
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800 font-semibold">
                      2 pessoas = Padrão seguro
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 font-semibold">
                      3+ pessoas = Pico reforçado
                    </span>
                  </div>

                  <div
                    tabIndex={0}
                    role="region"
                    aria-labelledby="ts-cap-coverage"
                    className="ts-table-region rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <table className="w-full text-left">
                      <caption id="ts-cap-coverage" className="sr-only">
                        Cobertura hora a hora da Semana {covWeek}
                      </caption>
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                        <tr>
                          <th scope="col" className="px-3 py-2.5 text-xs font-bold uppercase border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                            Faixa Horária
                          </th>
                          {TEAM_DAYS.map(d => (
                            <th
                              key={d}
                              scope="col"
                              className="px-2.5 py-2.5 text-xs font-bold uppercase border-b border-slate-200 dark:border-slate-700 whitespace-nowrap"
                            >
                              {d}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 25 }, (_, i) => 7 * 60 + 30 + i * 30).map(slotMin => {
                          const covTargetWeek = covWeek === 'A' ? config.weekA : config.weekB;
                          const isPeak = (slotMin >= 12 * 60 && slotMin < 16 * 60) || slotMin >= 19 * 60;
                          return (
                            <tr key={slotMin} className="border-b border-slate-200 dark:border-slate-800 last:border-b-0">
                              <th
                                scope="row"
                                className="px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap tabular-nums"
                              >
                                <span>
                                  {fmtMin(slotMin)}–{fmtMin(slotMin + 30)}
                                </span>
                                {isPeak && (
                                  <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 text-xs font-bold">
                                    PICO
                                  </span>
                                )}
                              </th>
                              {TEAM_DAY_KEYS.map((dk, idx) => {
                                if (dk === 'Dom' && slotMin >= 13 * 60) {
                                  return (
                                    <td key={dk} data-label={TEAM_DAYS[idx]} className="px-2.5 py-2 text-xs text-slate-400">
                                      Fechada
                                    </td>
                                  );
                                }
                                const present = activeRoster.filter(m => isWorkingAt(covTargetWeek[m.key]?.[dk], slotMin));
                                const cnt = present.length;
                                const names = present.map(m => m.name.split(' ')[0]).join(', ');
                                const cls =
                                  cnt === 0
                                    ? 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800'
                                    : cnt === 1
                                    ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                                    : cnt === 2
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                                    : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800';
                                return (
                                  <td key={dk} data-label={TEAM_DAYS[idx]} className="px-2 py-1.5 text-xs">
                                    <div className={`px-2 py-1 rounded border ${cls}`} title={names || 'Loja descoberta'}>
                                      <strong>{cnt}</strong> {cnt === 0 ? 'VAZIO' : `· ${names}`}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Painel Simulador Financeiro (Apenas ADM) */}
              {isAdmin && config.finance && financeBreakdown && (
                <div
                  ref={el => {
                    panelRefs.current.finance = el;
                  }}
                  role="tabpanel"
                  id="ts-panel-finance"
                  aria-labelledby="ts-tab-finance"
                  tabIndex={activeTab === 'finance' ? 0 : undefined}
                  hidden={activeTab !== 'finance'}
                >
                  <div className="pt-5 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h2 id="ts-finance-heading" className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          Simulador Financeiro — Simples Nacional (Anexo I Comércio)
                        </h2>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          Separe exatamente o desembolso mensal no caixa das provisões de 13º salário e férias.
                        </p>
                      </div>
                      {metrics && metrics.monthlyRevenueAvg > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            updateFinanceField('faturamentoRef', metrics.monthlyRevenueAvg);
                            addToast(`Faturamento atualizado pela média real do caixa (${fmtBRL(metrics.monthlyRevenueAvg)}).`, 'info');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 text-xs font-semibold cursor-pointer self-start"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Usar média real do caixa ({fmtBRL(metrics.monthlyRevenueAvg)})</span>
                        </button>
                      )}
                    </div>

                    <form
                      className="ts-form grid grid-cols-1 lg:grid-cols-2 gap-5"
                      aria-labelledby="ts-finance-heading"
                      noValidate
                      onSubmit={e => e.preventDefault()}
                    >
                      <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4 bg-slate-50 dark:bg-slate-950/40">
                        <legend className="text-sm font-bold px-1.5 text-slate-900 dark:text-slate-100">
                          1. Regime e Remuneração
                        </legend>

                        <div className="space-y-2">
                          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Modelo de vínculo</span>
                          <div className="space-y-2">
                            {(
                              [
                                {
                                  id: 'ts-reg-clt-int',
                                  val: 'clt_integral' as TeamRegime,
                                  title: 'CLT Integral (44h/sem) — Simples Nacional',
                                  desc: 'Sem 20% INSS patronal. FGTS 8% + provisão 13º/Férias (21%).'
                                },
                                {
                                  id: 'ts-reg-clt-parc',
                                  val: 'clt_parcial' as TeamRegime,
                                  title: 'CLT Jornada Parcial (até 30h/sem)',
                                  desc: 'Alíquotas CLT proporcionais ao salário acordado.'
                                },
                                {
                                  id: 'ts-reg-estagio',
                                  val: 'estagio' as TeamRegime,
                                  title: 'Estagiário de Farmácia (até 30h/sem — Lei 11.788)',
                                  desc: 'Sem FGTS, sem 13º e sem 1/3 férias; apenas recesso (1/12) + seguro.'
                                }
                              ]
                            ).map(opt => (
                              <label
                                key={opt.id}
                                htmlFor={opt.id}
                                className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                              >
                                <input
                                  type="radio"
                                  id={opt.id}
                                  name="regime"
                                  value={opt.val}
                                  checked={config.finance?.regime === opt.val}
                                  onChange={() => updateFinanceField('regime', opt.val)}
                                  className="mt-0.5 w-4 h-4"
                                />
                                <span>
                                  <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{opt.title}</span>
                                  <span className="block text-xs text-slate-500 dark:text-slate-400">{opt.desc}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Quantidade de contratados</span>
                          <div className="grid grid-cols-2 gap-2.5">
                            {[1, 2].map(q => (
                              <label
                                key={q}
                                htmlFor={`ts-qtd-${q}`}
                                className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                              >
                                <input
                                  type="radio"
                                  id={`ts-qtd-${q}`}
                                  name="qtdContratados"
                                  value={String(q)}
                                  checked={config.finance?.qtdContratados === q}
                                  onChange={() => updateFinanceField('qtdContratados', q as 1 | 2)}
                                  className="w-4 h-4"
                                />
                                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {q === 1 ? '1 pessoa' : '2 pessoas'}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="ts-inp-salario" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                              Salário / Bolsa por pessoa (R$) <span aria-hidden="true">*</span>
                            </label>
                            <input
                              type="number"
                              id="ts-inp-salario"
                              name="salarioBase"
                              value={config.finance.salarioBase}
                              min={500}
                              max={15000}
                              step={10}
                              required
                              aria-invalid={Boolean(fieldErrors.salarioBase)}
                              aria-describedby="ts-help-sal ts-err-sal"
                              onBlur={e => validateNumericField('salarioBase', 'Salário / Bolsa', e.target.value, 500, 15000, e.target)}
                              onChange={e => {
                                e.target.setCustomValidity('');
                                setFieldErrors(prev => ({ ...prev, salarioBase: '' }));
                                updateFinanceField('salarioBase', Number(e.target.value) || 0);
                              }}
                              className="w-full min-h-[48px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base tabular-nums"
                            />
                            <span id="ts-help-sal" className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                              Confirme o piso da CCT MG c/ contador.
                            </span>
                            <span id="ts-err-sal" className="block text-xs text-red-600 min-h-[1rem]" aria-live="polite">
                              {fieldErrors.salarioBase || ''}
                            </span>
                          </div>

                          <div>
                            <label htmlFor="ts-inp-vt" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                              Gasto total VT / mês (R$)
                            </label>
                            <input
                              type="number"
                              id="ts-inp-vt"
                              name="vtGastoTotal"
                              value={config.finance.vtGastoTotal}
                              min={0}
                              max={2000}
                              step={10}
                              required
                              aria-invalid={Boolean(fieldErrors.vtGastoTotal)}
                              aria-describedby="ts-help-vt ts-err-vt"
                              onBlur={e => validateNumericField('vtGastoTotal', 'Vale-Transporte', e.target.value, 0, 2000, e.target)}
                              onChange={e => {
                                e.target.setCustomValidity('');
                                setFieldErrors(prev => ({ ...prev, vtGastoTotal: '' }));
                                updateFinanceField('vtGastoTotal', Number(e.target.value) || 0);
                              }}
                              className="w-full min-h-[48px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base tabular-nums"
                            />
                            <span id="ts-help-vt" className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                              CLT desconta até 6% do salário; estágio 0%.
                            </span>
                            <span id="ts-err-vt" className="block text-xs text-red-600 min-h-[1rem]" aria-live="polite">
                              {fieldErrors.vtGastoTotal || ''}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                          <div>
                            <label htmlFor="ts-inp-outros" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                              Exame / Seguro / eSocial (R$)
                            </label>
                            <input
                              type="number"
                              id="ts-inp-outros"
                              name="outrosCustos"
                              value={config.finance.outrosCustos}
                              min={0}
                              max={1000}
                              step={5}
                              required
                              aria-invalid={Boolean(fieldErrors.outrosCustos)}
                              aria-describedby="ts-err-outros"
                              onBlur={e => validateNumericField('outrosCustos', 'Outros custos', e.target.value, 0, 1000, e.target)}
                              onChange={e => {
                                e.target.setCustomValidity('');
                                setFieldErrors(prev => ({ ...prev, outrosCustos: '' }));
                                updateFinanceField('outrosCustos', Number(e.target.value) || 0);
                              }}
                              className="w-full min-h-[48px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base tabular-nums"
                            />
                            <span id="ts-err-outros" className="block text-xs text-red-600 min-h-[1rem]" aria-live="polite">
                              {fieldErrors.outrosCustos || ''}
                            </span>
                          </div>

                          <div className="pt-1 sm:pt-7">
                            <label htmlFor="ts-chk-multa" className="inline-flex items-start gap-2.5 text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
                              <input
                                type="checkbox"
                                id="ts-chk-multa"
                                name="incluirMultaFgts"
                                checked={config.finance.incluirMultaFgts}
                                onChange={e => updateFinanceField('incluirMultaFgts', e.target.checked)}
                                className="mt-0.5 w-4 h-4"
                              />
                              <span>Incluir provisão multa FGTS 40% (~3,82%/mês)</span>
                            </label>
                          </div>
                        </div>
                      </fieldset>

                      <fieldset className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4 bg-slate-50 dark:bg-slate-950/40">
                        <legend className="text-sm font-bold px-1.5 text-slate-900 dark:text-slate-100">
                          2. Entregas na Folga &amp; Metas da Loja
                        </legend>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="ts-inp-dias-folga" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                              Dias de folga c/ entregas/mês
                            </label>
                            <input
                              type="number"
                              id="ts-inp-dias-folga"
                              name="diasFolgaMes"
                              value={config.finance.diasFolgaMes}
                              min={0}
                              max={31}
                              step={1}
                              required
                              aria-invalid={Boolean(fieldErrors.diasFolgaMes)}
                              aria-describedby="ts-err-dias"
                              onBlur={e => validateNumericField('diasFolgaMes', 'Dias de folga', e.target.value, 0, 31, e.target)}
                              onChange={e => {
                                e.target.setCustomValidity('');
                                setFieldErrors(prev => ({ ...prev, diasFolgaMes: '' }));
                                updateFinanceField('diasFolgaMes', Number(e.target.value) || 0);
                              }}
                              className="w-full min-h-[48px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base tabular-nums"
                            />
                            <span id="ts-err-dias" className="block text-xs text-red-600 min-h-[1rem]" aria-live="polite">
                              {fieldErrors.diasFolgaMes || ''}
                            </span>
                          </div>

                          <div>
                            <label htmlFor="ts-inp-custo-folga" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                              Gasto entregas / dia de folga (R$)
                            </label>
                            <input
                              type="number"
                              id="ts-inp-custo-folga"
                              name="custoEntregaFolga"
                              value={config.finance.custoEntregaFolga}
                              min={0}
                              max={1000}
                              step={5}
                              required
                              aria-invalid={Boolean(fieldErrors.custoEntregaFolga)}
                              aria-describedby="ts-help-folga ts-err-custo-folga"
                              onBlur={e => validateNumericField('custoEntregaFolga', 'Gasto entregas', e.target.value, 0, 1000, e.target)}
                              onChange={e => {
                                e.target.setCustomValidity('');
                                setFieldErrors(prev => ({ ...prev, custoEntregaFolga: '' }));
                                updateFinanceField('custoEntregaFolga', Number(e.target.value) || 0);
                              }}
                              className="w-full min-h-[48px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base tabular-nums"
                            />
                            <span id="ts-help-folga" className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                              Média do sistema: ~{metrics?.deliveriesPerDayAvg ?? 6.3} entregas/dia.
                            </span>
                            <span id="ts-err-custo-folga" className="block text-xs text-red-600 min-h-[1rem]" aria-live="polite">
                              {fieldErrors.custoEntregaFolga || ''}
                            </span>
                          </div>

                          <div>
                            <label htmlFor="ts-inp-fat" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                              Faturamento de referência (R$)
                            </label>
                            <input
                              type="number"
                              id="ts-inp-fat"
                              name="faturamentoRef"
                              value={config.finance.faturamentoRef}
                              min={5000}
                              max={500000}
                              step={500}
                              required
                              aria-invalid={Boolean(fieldErrors.faturamentoRef)}
                              aria-describedby="ts-err-fat"
                              onBlur={e => validateNumericField('faturamentoRef', 'Faturamento', e.target.value, 5000, 500000, e.target)}
                              onChange={e => {
                                e.target.setCustomValidity('');
                                setFieldErrors(prev => ({ ...prev, faturamentoRef: '' }));
                                updateFinanceField('faturamentoRef', Number(e.target.value) || 0);
                              }}
                              className="w-full min-h-[48px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base tabular-nums"
                            />
                            <span id="ts-err-fat" className="block text-xs text-red-600 min-h-[1rem]" aria-live="polite">
                              {fieldErrors.faturamentoRef || ''}
                            </span>
                          </div>

                          <div>
                            <label htmlFor="ts-inp-teto" className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                              Teto de orçamento mensal (R$)
                            </label>
                            <input
                              type="number"
                              id="ts-inp-teto"
                              name="tetoOrcamento"
                              value={config.finance.tetoOrcamento}
                              min={500}
                              max={50000}
                              step={50}
                              required
                              aria-invalid={Boolean(fieldErrors.tetoOrcamento)}
                              aria-describedby="ts-err-teto"
                              onBlur={e => validateNumericField('tetoOrcamento', 'Teto de orçamento', e.target.value, 500, 50000, e.target)}
                              onChange={e => {
                                e.target.setCustomValidity('');
                                setFieldErrors(prev => ({ ...prev, tetoOrcamento: '' }));
                                updateFinanceField('tetoOrcamento', Number(e.target.value) || 0);
                              }}
                              className="w-full min-h-[48px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base tabular-nums"
                            />
                            <span id="ts-err-teto" className="block text-xs text-red-600 min-h-[1rem]" aria-live="polite">
                              {fieldErrors.tetoOrcamento || ''}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                            <span className="block text-xs text-slate-500 dark:text-slate-400">Sai do Caixa / Mês</span>
                            <strong className="block text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                              {fmtBRL(financeBreakdown.desembolsoTotal)}
                            </strong>
                          </div>
                          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                            <span className="block text-xs text-slate-500 dark:text-slate-400">Provisão 13º / Férias</span>
                            <strong className="block text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                              {fmtBRL(financeBreakdown.provisaoTotal)}
                            </strong>
                          </div>
                          <div
                            className={`p-3 rounded-xl border ${
                              financeBreakdown.margemTeto >= 0
                                ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800'
                                : 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800'
                            }`}
                          >
                            <span className="block text-xs font-medium">Total ({financeBreakdown.pctFat.toFixed(1)}% fat.)</span>
                            <strong className="block text-lg font-bold tabular-nums">{fmtBRL(financeBreakdown.custoTotalReal)}</strong>
                          </div>
                        </div>
                      </fieldset>
                    </form>

                    <div
                      tabIndex={0}
                      role="region"
                      aria-labelledby="ts-cap-finance"
                      className="ts-table-region rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      <table className="w-full text-left">
                        <caption id="ts-cap-finance" className="sr-only">
                          Detalhamento mensal de custos e provisões
                        </caption>
                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                          <tr>
                            <th scope="col" className="px-3 py-2.5 text-xs font-bold uppercase border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                              Bloco / Item
                            </th>
                            <th scope="col" className="px-3 py-2.5 text-xs font-bold uppercase border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                              Base de Cálculo
                            </th>
                            <th scope="col" className="px-3 py-2.5 text-xs font-bold uppercase border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                              Natureza
                            </th>
                            <th scope="col" className="px-3 py-2.5 text-xs font-bold uppercase border-b border-slate-200 dark:border-slate-700 whitespace-nowrap text-right">
                              Valor Mensal
                            </th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {[
                            {
                              item: `Salário / Bolsa Bruta (${financeBreakdown.qtd}x)`,
                              base: `${financeBreakdown.qtd} × ${fmtBRL(financeBreakdown.sal)}`,
                              tipo: 'Desembolso mensal',
                              val: financeBreakdown.qtd * financeBreakdown.sal
                            },
                            {
                              item: 'FGTS Mensal',
                              base: financeBreakdown.isIntern ? 'Isento no estágio (0%)' : '8,00% sobre bruto',
                              tipo: 'Desembolso mensal',
                              val: financeBreakdown.qtd * financeBreakdown.fgtsUnit
                            },
                            {
                              item: 'Vale-Transporte / Auxílio Líquido',
                              base: financeBreakdown.isIntern ? 'Integral pela empresa' : 'Gasto − até 6% do salário',
                              tipo: 'Desembolso mensal',
                              val: financeBreakdown.qtd * financeBreakdown.vtNetUnit
                            },
                            {
                              item: 'Exame / Seguro / eSocial rateado',
                              base: `${financeBreakdown.qtd} × ${fmtBRL(financeBreakdown.outrosUnit)}`,
                              tipo: 'Desembolso mensal',
                              val: financeBreakdown.qtd * financeBreakdown.outrosUnit
                            },
                            {
                              item: 'Entregas na Folga (rotas / app)',
                              base: `${config.finance.diasFolgaMes} dias × ${fmtBRL(config.finance.custoEntregaFolga)}`,
                              tipo: 'Desembolso mensal',
                              val: financeBreakdown.entregasFolga
                            },
                            {
                              item: financeBreakdown.isIntern ? 'Recesso Remunerado Estágio (1/12)' : 'Provisão 13º Salário (1/12)',
                              base: '8,333% sobre bruto/bolsa',
                              tipo: 'Provisão reserva',
                              val: financeBreakdown.qtd * (financeBreakdown.isIntern ? financeBreakdown.feriasUnit : financeBreakdown.decimoUnit)
                            },
                            ...(!financeBreakdown.isIntern
                              ? [
                                  {
                                    item: 'Provisão Férias + 1/3 Constitucional',
                                    base: '11,111% sobre bruto',
                                    tipo: 'Provisão reserva',
                                    val: financeBreakdown.qtd * financeBreakdown.feriasUnit
                                  },
                                  {
                                    item: 'FGTS sobre 13º e Férias + 1/3',
                                    base: '1,556% sobre bruto',
                                    tipo: 'Provisão reserva',
                                    val: financeBreakdown.qtd * financeBreakdown.fgtsProvUnit
                                  }
                                ]
                              : []),
                            ...(!financeBreakdown.isIntern && config.finance.incluirMultaFgts
                              ? [
                                  {
                                    item: 'Provisão Multa FGTS 40%',
                                    base: '40% s/ depósitos FGTS (~3,82%)',
                                    tipo: 'Provisão opcional',
                                    val: financeBreakdown.qtd * financeBreakdown.multaUnit
                                  }
                                ]
                              : [])
                          ].map((row, idx) => (
                            <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                              <th scope="row" className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                {row.item}
                              </th>
                              <td data-label="Base de Cálculo" className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                                {row.base}
                              </td>
                              <td data-label="Natureza" className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                                {row.tipo}
                              </td>
                              <td data-label="Valor Mensal" className="px-3 py-2.5 text-right font-semibold tabular-nums">
                                {fmtBRL(row.val)}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                            <th scope="row" className="px-3 py-2.5 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              TOTAL DESEMBOLSO NO CAIXA
                            </th>
                            <td data-label="Base de Cálculo" className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                              Saída imediata mensal
                            </td>
                            <td data-label="Natureza" className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                              Caixa mês
                            </td>
                            <td data-label="Valor Mensal" className="px-3 py-2.5 text-right font-bold tabular-nums">
                              {fmtBRL(financeBreakdown.desembolsoTotal)}
                            </td>
                          </tr>
                          <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                            <th scope="row" className="px-3 py-2.5 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              TOTAL PROVISÃO MENSAL
                            </th>
                            <td data-label="Base de Cálculo" className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                              Guardar em reserva separada
                            </td>
                            <td data-label="Natureza" className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                              Reserva
                            </td>
                            <td data-label="Valor Mensal" className="px-3 py-2.5 text-right font-bold tabular-nums">
                              {fmtBRL(financeBreakdown.provisaoTotal)}
                            </td>
                          </tr>
                          <tr className="bg-emerald-50/70 dark:bg-emerald-950/30">
                            <th scope="row" className="px-3 py-3 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              CUSTO REAL TOTAL (C/ PROVISÕES)
                            </th>
                            <td data-label="Base de Cálculo" className="px-3 py-3 text-slate-700 dark:text-slate-300">
                              {financeBreakdown.pctFat.toFixed(2)}% de {fmtBRL(config.finance.faturamentoRef)}
                            </td>
                            <td data-label="Natureza" className="px-3 py-3 text-slate-700 dark:text-slate-300">
                              Total mês
                            </td>
                            <td data-label="Valor Mensal" className="px-3 py-3 text-right font-bold text-base tabular-nums">
                              {fmtBRL(financeBreakdown.custoTotalReal)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Painel Guia CLT, CRF-MG & Entregas */}
              <div
                ref={el => {
                  panelRefs.current.guide = el;
                }}
                role="tabpanel"
                id="ts-panel-guide"
                aria-labelledby="ts-tab-guide"
                tabIndex={activeTab === 'guide' ? 0 : undefined}
                hidden={activeTab !== 'guide'}
              >
                <div className="pt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Info className="w-4 h-4 text-blue-600" />
                      <span>Regras Trabalhistas (CLT)</span>
                    </h2>
                    <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300 list-disc pl-4">
                      <li><strong>Ponto diário obrigatório</strong> (folha ou app) desde o 1º dia, mesmo com menos de 20 funcionários.</li>
                      <li><strong>Intervalo de 1h00 integral</strong> (Art. 71 CLT) em jornadas acima de 6h — nunca atender durante o almoço.</li>
                      <li><strong>Domingos 100% livres</strong> no modelo recomendado: elimina risco de escala dominical (Art. 386) e interjornada de 11h.</li>
                      <li><strong>Contrato de experiência 45 + 45 dias</strong> e evitar entregas de moto pelo balconista (evita 30% de periculosidade).</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Proteção Sanitária (CRF-MG)</span>
                    </h2>
                    <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300 list-disc pl-4">
                      <li><strong>100% dos dias úteis (Seg–Sex)</strong> têm presença da farmacêutica sócia na loja.</li>
                      <li><strong>Trava de controlados e SNGPC:</strong> proibido dispensar psicotrópicos (Portaria 344/98) ou antimicrobianos na ausência da RT.</li>
                      <li>Protocolar ausência formal no portal CRF-MG em caso de férias ou atestados em dias úteis.</li>
                      <li>Quando o faturamento estabilizar acima de R$ 55k–60k/mês, planejar farmacêutico folguista para sábados/domingos.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-3">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <ClipboardCopy className="w-4 h-4 text-red-600" />
                      <span>Protocolo Entregas — Folga da Terça</span>
                    </h2>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      Agrupar pedidos em <strong>2 rotas fixas (13:00 e 18:30)</strong> ou acionar Uber Flash / 99 Entrega sob demanda para urgências.
                    </p>
                    <blockquote className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300">
                      “{WEDNESDAY_WHATSAPP_SCRIPT}”
                    </blockquote>
                    <button
                      type="button"
                      onClick={handleCopyScript}
                      className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                    >
                      <ClipboardCopy className="w-3.5 h-3.5" />
                      <span>Copiar Script de WhatsApp</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Modal Nativo <dialog> de Confirmação (modern-web-guidance: dialog) */}
      <dialog
        ref={confirmDialogRef}
        {...({ closedby: 'any' } as any)}
        aria-labelledby="ts-confirm-title"
        className="team-schedule-dialog m-auto max-w-md w-[calc(100%-2rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-0 shadow-2xl"
      >
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <h1 id="ts-confirm-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {pendingAction?.title || 'Confirmar alteração'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {pendingAction?.description || ''}
            </p>
          </div>
          <form method="dialog" className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="submit"
              value="cancel"
              autoFocus
              className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              value="confirm"
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold cursor-pointer"
            >
              Aplicar Cenário
            </button>
          </form>
        </div>
      </dialog>

      {/* Folha Limpa para Impressão A4 */}
      <section className="hidden print:block team-schedule-print-sheet" aria-label="Versão de impressão da escala quinzenal">
        <div style={{ marginBottom: '12px' }}>
          <h1 style={{ fontSize: '15pt', fontWeight: 800, margin: 0 }}>BelaFarma — Escala Oficial Quinzenal</h1>
          <p style={{ fontSize: '9pt', margin: '4px 0 0' }}>
            Horário da loja: Seg–Sáb 07:30–20:00 · Dom 07:30–13:00 (80h30/sem) · Semana vigente hoje: Semana {currentWeekType}
          </p>
        </div>

        {(['A', 'B'] as const).map(wk => {
          const wkObj = wk === 'A' ? config.weekA : config.weekB;
          return (
            <div key={wk} style={{ marginBottom: '14px' }}>
              <h2 style={{ fontSize: '11pt', fontWeight: 700, margin: '0 0 6px' }}>
                {wk === 'A'
                  ? 'Semana A (Farmacêutica folga Sáb + Dom · Edevaldo folga Terça)'
                  : 'Semana B (Edevaldo folga Terça + Sáb tarde + Dom · Farmacêutica 3 tardes livres)'}
              </h2>
              <table>
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    {TEAM_DAYS.map(d => (
                      <th key={d}>{d}</th>
                    ))}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRoster.map(member => {
                    let totalMin = 0;
                    return (
                      <tr key={member.key}>
                        <td>
                          <strong>{member.name}</strong>
                        </td>
                        {TEAM_DAY_KEYS.map(dk => {
                          const cell = wkObj[member.key]?.[dk];
                          totalMin += shiftMinutes(cell);
                          if (!cell || cell.off) {
                            return <td key={dk}>FOLGA</td>;
                          }
                          return (
                            <td key={dk}>
                              <div>
                                {cell.start}–{cell.end}
                              </div>
                              {cell.lStart && cell.lEnd && (
                                <div>
                                  Alm. {cell.lStart}–{cell.lEnd}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td>
                          <strong>{fmtHours(totalMin / 60)}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}

        <p style={{ fontSize: '8.5pt', marginTop: '8px' }}>
          <strong>Protocolo de Entregas na Folga (Terça-feira):</strong> Agrupar pedidos em 2 saídas fixas (13:00 e 18:30) e acionar entrega por app (Uber Flash / 99) para urgências. Dispensação de controlados/antimicrobianos exclusiva com a Farmacêutica RT.
        </p>
      </section>
    </>
  );
};
