import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  X,
  RotateCcw,
  FileCode,
  Clock,
  FastForward,
  Loader2,
  Archive,
  CheckSquare
} from 'lucide-react';

export interface BlockingReference {
  file: string;
  line?: number;
  type: string;
  detail: string;
}

export interface FeatureDependencyAnalysis {
  featureId: string;
  label: string;
  componentName?: string;
  files?: string[];
  canUninstallSafely: boolean;
  blockingReferences: BlockingReference[];
}

export interface FeatureAuditItem {
  featureId: string;
  label: string;
  usageCount: number;
  lastUsedAt: string | null;
  lastUserName?: string | null;
  status: 'ACTIVE' | 'WHITELISTED' | 'UNINSTALLED';
  whitelistedUntil?: string | null;
  uninstalledAt?: string | null;
  uninstalledBy?: string | null;
  isProtected: boolean;
  isAbandoned: boolean;
  componentName?: string;
  files?: string[];
}

interface FeatureAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFeatureIds: string[];
  keptFeatureIds: string[];
  allFeatures: FeatureAuditItem[];
  monitoringStartedAt: string;
  elapsedDays: number;
  daysRemaining: number;
  isPeriodCompleted: boolean;
  userName: string;
  onSuccessUpdate: (updatedReport: any) => void;
}

export const FeatureAuditModal: React.FC<FeatureAuditModalProps> = ({
  isOpen,
  onClose,
  selectedFeatureIds,
  keptFeatureIds,
  allFeatures,
  monitoringStartedAt,
  elapsedDays,
  daysRemaining,
  isPeriodCompleted,
  userName,
  onSuccessUpdate
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [analysisMap, setAnalysisMap] = useState<Record<string, FeatureDependencyAnalysis>>({});
  const [activeTab, setActiveTab] = useState<'confirm' | 'uninstalled' | 'stats'>('confirm');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && selectedFeatureIds.length > 0) {
      runDependencyScan(selectedFeatureIds);
    } else if (isOpen) {
      setAnalysisMap({});
    }
  }, [isOpen, selectedFeatureIds.join(',')]);

  const runDependencyScan = async (ids: string[]) => {
    setIsAnalyzing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/system/feature-audit/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureIds: ids })
      });
      const data = await res.json();
      if (data.success && data.analysis) {
        setAnalysisMap(data.analysis);
      } else {
        setErrorMsg(data.error || 'Falha ao analisar dependências no código-fonte.');
      }
    } catch (e: any) {
      setErrorMsg('Servidor de análise indisponível no momento.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  const selectedItems = allFeatures.filter(f => selectedFeatureIds.includes(f.featureId));
  const keptItems = allFeatures.filter(f => keptFeatureIds.includes(f.featureId));
  const uninstalledItems = allFeatures.filter(f => f.status === 'UNINSTALLED');

  const safeToUninstallIds = selectedFeatureIds.filter(id => analysisMap[id]?.canUninstallSafely);
  const blockedIds = selectedFeatureIds.filter(id => analysisMap[id] && !analysisMap[id].canUninstallSafely);

  const handleConfirmUninstall = async (onlySafeOnes: boolean, forceHideBlocked: boolean = false) => {
    const targetIds = onlySafeOnes ? safeToUninstallIds : selectedFeatureIds;
    if (targetIds.length === 0 && keptFeatureIds.length === 0) return;

    setIsExecuting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/system/feature-audit/uninstall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedFeatureIds: targetIds,
          keptFeatureIds,
          userName,
          forceHideOnly: forceHideBlocked
        })
      });
      const data = await res.json();
      if (data.statusReport) {
        onSuccessUpdate(data.statusReport);
        onClose();
      } else {
        setErrorMsg(data.error || 'Não foi possível concluir a operação.');
      }
    } catch (e: any) {
      setErrorMsg('Erro de comunicação ao executar desinstalação.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRestore = async (featureId: string) => {
    setIsExecuting(true);
    try {
      const res = await fetch('/api/system/feature-audit/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureId })
      });
      const data = await res.json();
      if (data.success) {
        onSuccessUpdate(data);
      }
    } catch (e) {
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSimulate15Days = async (days: number) => {
    setIsExecuting(true);
    try {
      const res = await fetch('/api/system/feature-audit/simulate-period', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysAgo: days })
      });
      const data = await res.json();
      if (data.success) {
        onSuccessUpdate(data);
      }
    } catch (e) {
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-red-600/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border border-red-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                Auditoria de Recursos & Verificação de Dependências
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Ciclo de monitoramento de 15 dias • Iniciado em {new Date(monitoringStartedAt).toLocaleDateString('pt-BR')} ({elapsedDays}d corridos)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas de Navegação */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/40 dark:bg-slate-950/30 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('confirm')}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-t-xl border-b-2 transition-all ${
                activeTab === 'confirm'
                  ? 'border-red-600 text-red-600 dark:text-red-400 bg-white dark:bg-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Análise de Impacto ({selectedFeatureIds.length})
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-t-xl border-b-2 transition-all ${
                activeTab === 'stats'
                  ? 'border-red-600 text-red-600 dark:text-red-400 bg-white dark:bg-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Relatório de Uso (15 Dias)
            </button>
            <button
              onClick={() => setActiveTab('uninstalled')}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-t-xl border-b-2 transition-all ${
                activeTab === 'uninstalled'
                  ? 'border-red-600 text-red-600 dark:text-red-400 bg-white dark:bg-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Quarentena / Desinstalados ({uninstalledItems.length})
            </button>
          </div>

          <div className="flex items-center gap-2 pb-2">
            {!isPeriodCompleted ? (
              <button
                onClick={() => handleSimulate15Days(15)}
                disabled={isExecuting}
                title="Avança o relógio do ciclo para completar os 15 dias imediatamente e liberar os checkboxes automáticos"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-all cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                Simular 15 Dias Concluídos
              </button>
            ) : (
              <button
                onClick={() => handleSimulate15Days(0)}
                disabled={isExecuting}
                title="Reinicia a contagem do ciclo de 15 dias a partir de hoje"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reiniciar Ciclo (Dia 0)
              </button>
            )}
          </div>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'confirm' && (
            <>
              {isAnalyzing ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-red-600" />
                  <p className="text-sm font-bold">Escaneando referências cruzadas, imports e rotas no código-fonte...</p>
                </div>
              ) : selectedItems.length === 0 && keptItems.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Nenhum recurso selecionado para desinstalação.
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Marque os checkboxes no menu lateral ou consulte a aba "Relatório de Uso (15 Dias)".
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Resumo de Segurança */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-lg font-black text-emerald-800 dark:text-emerald-300 leading-none">
                          {safeToUninstallIds.length}
                        </div>
                        <div className="text-[11px] font-bold text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                          Livres de Dependências (Seguros)
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div>
                        <div className="text-lg font-black text-amber-800 dark:text-amber-300 leading-none">
                          {blockedIds.length}
                        </div>
                        <div className="text-[11px] font-bold text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                          Bloqueados (Referências Ativas)
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 flex items-center gap-3">
                      <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <div>
                        <div className="text-lg font-black text-blue-800 dark:text-blue-300 leading-none">
                          {keptItems.length}
                        </div>
                        <div className="text-[11px] font-bold text-blue-700/80 dark:text-blue-400/80 mt-0.5">
                          Desmarcados (Manter por +15d)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Lista Detalhada de Análise de Impacto */}
                  <div className="space-y-3">
                    {selectedItems.map((item) => {
                      const check = analysisMap[item.featureId];
                      const isSafe = check?.canUninstallSafely;
                      const refs = check?.blockingReferences || [];

                      return (
                        <div
                          key={item.featureId}
                          className={`p-4 rounded-2xl border transition-all ${
                            isSafe
                              ? 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-900/60'
                              : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/80'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-2.5">
                              {isSafe ? (
                                <span className="p-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                  <ShieldCheck className="w-4 h-4" />
                                </span>
                              ) : (
                                <span className="p-1.5 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="w-4 h-4" />
                                </span>
                              )}
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-slate-900 dark:text-white">
                                    {item.label}
                                  </span>
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                    id: {item.featureId}
                                  </span>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                                    {item.usageCount} usos nos últimos 15d
                                  </span>
                                </div>
                                {check?.files && check.files.length > 0 && (
                                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                                    <FileCode className="w-3 h-3" />
                                    <span>Arquivo alvo: {check.files.join(', ')}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                                isSafe
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40'
                              }`}
                            >
                              {isSafe ? 'Remoção Segura Aprovada' : 'Bloqueado • Possui Dependências'}
                            </span>
                          </div>

                          {!isSafe && refs.length > 0 && (
                            <div className="mt-3 pl-9 space-y-1.5">
                              <p className="text-[11px] font-extrabold text-amber-900 dark:text-amber-200">
                                ⚠️ Desinstalação física impedida automaticamente! Este módulo ainda é consumido em:
                              </p>
                              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                {refs.map((r, i) => (
                                  <div
                                    key={i}
                                    className="text-[11px] font-mono bg-white/80 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-2"
                                  >
                                    <span className="text-slate-700 dark:text-slate-300 truncate">{r.detail}</span>
                                    <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 font-bold shrink-0">
                                      {r.file}{r.line ? `:${r.line}` : ''}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <p className="text-[10px] font-semibold text-amber-800/80 dark:text-amber-300/80 pt-0.5">
                                Recomendação: Revise manualmente os arquivos acima antes de apagar o código, ou escolha apenas ocultar o atalho do menu lateral.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'stats' && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/70 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2.5 px-3 whitespace-nowrap">Ferramenta (Menu)</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Componente</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right">Acessos (15d)</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Último Uso</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Status de Auditoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
                  {allFeatures.map((f) => (
                    <tr key={f.featureId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 px-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <span>{f.label}</span>
                          <span className="text-[10px] font-mono text-slate-400">({f.featureId})</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {f.componentName || '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-black whitespace-nowrap">
                        <span className={f.usageCount === 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}>
                          {f.usageCount}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[11px] text-slate-500 whitespace-nowrap">
                        {f.lastUsedAt
                          ? `${new Date(f.lastUsedAt).toLocaleString('pt-BR')} (${f.lastUserName || 'Operador'})`
                          : 'Sem registro no período'}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {f.isProtected ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                            Núcleo Protegido
                          </span>
                        ) : f.status === 'UNINSTALLED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-500/20 text-slate-600 dark:text-slate-400">
                            Desinstalado
                          </span>
                        ) : f.status === 'WHITELISTED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/15 text-blue-600 dark:text-blue-400">
                            Mantido (+15d)
                          </span>
                        ) : f.isAbandoned ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500/15 text-red-600 dark:text-red-400">
                            Abandonado (0 usos)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            Em Uso Ativo
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'uninstalled' && (
            <div className="space-y-3">
              {uninstalledItems.length === 0 ? (
                <div className="py-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
                  <Archive className="w-10 h-10 mx-auto opacity-50" />
                  <p className="text-sm font-bold">Nenhuma ferramenta está em quarentena ou desinstalada.</p>
                </div>
              ) : (
                uninstalledItems.map((u) => (
                  <div
                    key={u.featureId}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900 dark:text-white">{u.label}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-500">
                          {u.featureId}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Desinstalado em {u.uninstalledAt ? new Date(u.uninstalledAt).toLocaleString('pt-BR') : '-'} por {u.uninstalledBy || 'Admin'} • Backup salvo em <code>_archived_features/{u.featureId}</code>
                      </p>
                    </div>
                    <button
                      onClick={() => handleRestore(u.featureId)}
                      disabled={isExecuting}
                      title="Restaurar ferramenta para o Menu Lateral imediatamente"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restaurar Recurso
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Rodapé de Ação */}
        {activeTab === 'confirm' && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Os arquivos aprovados são salvos em <code>_archived_features/</code> antes da remoção do menu.
            </div>
            <div className="flex items-center gap-2.5 ml-auto">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                Cancelar
              </button>

              {blockedIds.length > 0 && (
                <button
                  onClick={() => handleConfirmUninstall(false, true)}
                  disabled={isExecuting || isAnalyzing}
                  className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-md transition-all cursor-pointer disabled:opacity-50"
                  title="Mantém o código intacto para não quebrar as referências encontradas, mas remove todos os selecionados do menu lateral"
                >
                  Apenas Ocultar Todos do Menu ({selectedFeatureIds.length})
                </button>
              )}

              <button
                onClick={() => handleConfirmUninstall(true, false)}
                disabled={isExecuting || isAnalyzing || (safeToUninstallIds.length === 0 && keptFeatureIds.length === 0)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {isExecuting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>
                  {safeToUninstallIds.length > 0
                    ? `Desinstalar Aprovados (${safeToUninstallIds.length})`
                    : keptFeatureIds.length > 0
                      ? `Salvar Mantidos (${keptFeatureIds.length})`
                      : 'Desinstalar Aprovados (0)'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
