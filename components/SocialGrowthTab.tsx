import React, { useCallback, useEffect, useId, useState } from 'react';
import {
  Rocket,
  Copy,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Send,
  BarChart3,
  Settings,
  ShieldAlert,
  Target,
  Clock,
  Trash2,
  MousePointerClick,
  MapPin,
  Instagram,
  RefreshCw,
  X,
} from 'lucide-react';
import { useToast } from './ToastContext';
import { BioConfig } from './vitrine/vitrineTypes';

interface ChecklistItem {
  id: string;
  phase: string;
  sortOrder: number;
  title: string;
  description: string;
  completed: boolean;
  completedAt: string | null;
}

interface SocialPostFeed {
  id: string;
  dia: string;
  formato: string;
  pilar: string;
  titulo: string;
  gancho3s: string;
  roteiroOuSlides: string;
  legenda: string;
  cta: string;
  hashtags: string[];
  alertaAnvisa: string;
}

interface SocialStory {
  dia: string;
  ideia: string;
  cta: string;
}

interface SocialWeekPlan {
  temaSemana?: string;
  resumoEstrategico?: string;
  postsFeed?: SocialPostFeed[];
  stories?: SocialStory[];
  googlePerfil?: {
    titulo?: string;
    texto?: string;
    ctaBotao?: string;
  };
  sugestaoTrafegoPago?: {
    objetivo?: string;
    publico?: string;
    verbaSugerida?: string;
    ideiaCriativo?: string;
  };
  climateContext?: string;
  fallback?: boolean;
}

interface SocialWeekRecord {
  id: string;
  weekLabel: string;
  focusTheme: string;
  climateContext: string;
  plan: SocialWeekPlan;
  progress: Record<string, boolean>;
  sentToWhatsapp: boolean;
  sentAt: string | null;
  createdAt: string;
}

interface SocialKpiRecord {
  id: string;
  weekStart: string;
  followersCount: number;
  localReach: number;
  profileVisits: number;
  bioClicks: number;
  whatsappOrders: number;
  googleReviews: number;
  adSpend: number;
  notes: string;
  createdAt: string;
}

interface BioStats {
  total30Days: number;
  byButton: Array<{ buttonId: string; buttonLabel: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
}

type SubTab = 'overview' | 'calendar' | 'kpis' | 'config';

const DEFAULT_CONFIG: BioConfig = {
  instagramHandle: '@belafarmasul',
  whatsappNumber: '5532998228189',
  whatsappDisplay: '(32) 99822-8189',
  storeAddress: 'Bairro Ipiranga, Juiz de Fora - MG',
  openingHours: 'Seg–Sáb 07h30 às 20h • Dom 07h30 às 13h',
  paymentsText: 'Cartão Brasil Card • Pix • Crédito/Débito • Dinheiro',
  googleMapsUrl:
    'https://www.google.com/maps/search/?api=1&query=Drogaria+Bela+Farma+Sul+Ipiranga+Juiz+de+Fora+MG',
  googleReviewUrl: '',
  ifoodUrl: '',
  vitrineUrl: '/promocao?utm_source=instagram&utm_medium=bio&utm_campaign=link_bio',
  bioHeadline: 'Bela Farma Sul • Bairro Ipiranga, JF',
  bioSubheadline:
    'Entrega super rápida e grátis nos bairros próximos • Aceitamos Cartão Brasil Card',
  showHours: true,
  showIfood: false,
  showBrasilCard: true,
  monthlyAdBudget: 450,
};

function fmtBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export const SocialGrowthTab: React.FC = () => {
  const { addToast } = useToast();
  const uid = useId();

  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [loading, setLoading] = useState(true);

  const [config, setConfig] = useState<BioConfig>(DEFAULT_CONFIG);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [weeks, setWeeks] = useState<SocialWeekRecord[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>('');
  const [kpis, setKpis] = useState<SocialKpiRecord[]>([]);
  const [bioStats, setBioStats] = useState<BioStats>({
    total30Days: 0,
    byButton: [],
    bySource: [],
  });

  // Calendário Semanal
  const [focusTheme, setFocusTheme] = useState('');
  const [generatingWeek, setGeneratingWeek] = useState(false);
  const [whatsappTarget, setWhatsappTarget] = useState('');
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);

  // Formulário KPI
  const [kpiForm, setKpiForm] = useState({
    weekStart: new Date().toISOString().split('T')[0],
    followersCount: '',
    localReach: '',
    profileVisits: '',
    bioClicks: '',
    whatsappOrders: '',
    googleReviews: '',
    adSpend: '',
    notes: '',
  });
  const [savingKpi, setSavingKpi] = useState(false);
  const [kpiToDelete, setKpiToDelete] = useState<SocialKpiRecord | null>(null);
  const [deletingKpi, setDeletingKpi] = useState(false);

  // Formulário Config
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/social-growth/overview');
      if (!res.ok) throw new Error('Falha ao carregar painel social');
      const data = await res.json();
      if (data.config) setConfig({ ...DEFAULT_CONFIG, ...data.config });
      if (Array.isArray(data.checklist)) setChecklist(data.checklist);
      if (Array.isArray(data.weeks)) {
        setWeeks(data.weeks);
        setSelectedWeekId((prev) => prev || data.weeks[0]?.id || '');
      }
      if (Array.isArray(data.kpis)) setKpis(data.kpis);
      if (data.bioStats) setBioStats(data.bioStats);
    } catch (err) {
      addToast('Não foi possível carregar os dados de Crescimento Social.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const currentWeek = weeks.find((w) => w.id === selectedWeekId) || weeks[0] || null;
  const completedChecklistCount = checklist.filter((c) => c.completed).length;

  const baseOrigin =
    typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? window.location.origin
      : 'https://drogariabelafarma.com.br';

  const utmLinks = [
    {
      id: 'ig_bio',
      label: 'Bio do Instagram',
      url: `${baseOrigin}/bio?utm_source=instagram&utm_medium=bio&utm_campaign=perfil`,
    },
    {
      id: 'ig_stories',
      label: 'Stories do Instagram',
      url: `${baseOrigin}/bio?utm_source=instagram&utm_medium=stories&utm_campaign=diario`,
    },
    {
      id: 'google_maps',
      label: 'Google Perfil da Empresa (Maps)',
      url: `${baseOrigin}/bio?utm_source=google&utm_medium=maps&utm_campaign=perfil_local`,
    },
    {
      id: 'whatsapp_status',
      label: 'Status do WhatsApp',
      url: `${baseOrigin}/promocao?utm_source=whatsapp&utm_medium=status&utm_campaign=vitrine`,
    },
  ];

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast(`${label} copiado para a área de transferência!`, 'success');
    } catch {
      addToast('Não foi possível copiar automaticamente.', 'warning');
    }
  };

  const handleToggleChecklist = async (id: string, completed: boolean) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed } : item))
    );
    try {
      const res = await fetch(`/api/marketing/social-growth/checklist/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) throw new Error('Erro ao atualizar');
    } catch {
      addToast('Erro ao salvar progresso do checklist.', 'error');
      fetchOverview();
    }
  };

  const handleGenerateWeek = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingWeek(true);
    addToast('🤖 Isa montando sua pauta semanal no Ritmo Sustentável...', 'info');
    try {
      const res = await fetch('/api/marketing/social-growth/generate-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focusTheme: focusTheme.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.week) {
        throw new Error(data.error || 'Erro ao gerar pauta');
      }
      setWeeks((prev) => [data.week, ...prev]);
      setSelectedWeekId(data.week.id);
      setFocusTheme('');
      addToast(
        data.week.plan?.fallback
          ? '✅ Pauta semanal gerada (modelo base seguro ANVISA).'
          : '✅ Pauta semanal criada pela Isa com sucesso!',
        'success'
      );
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao gerar pauta.', 'error');
    } finally {
      setGeneratingWeek(false);
    }
  };

  const handleToggleWeekProgress = async (week: SocialWeekRecord, key: string) => {
    const nextProgress = { ...(week.progress || {}), [key]: !week.progress?.[key] };
    setWeeks((prev) =>
      prev.map((w) => (w.id === week.id ? { ...w, progress: nextProgress } : w))
    );
    try {
      const res = await fetch(`/api/marketing/social-growth/weeks/${week.id}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: nextProgress }),
      });
      if (!res.ok) throw new Error('Falha ao salvar progresso');
    } catch {
      addToast('Erro ao atualizar item da semana.', 'error');
      fetchOverview();
    }
  };

  const handleSendWeekWhatsapp = async () => {
    if (!currentWeek) return;
    setSendingWhatsapp(true);
    try {
      const res = await fetch(
        `/api/marketing/social-growth/weeks/${currentWeek.id}/send-whatsapp`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(whatsappTarget.trim() ? { phone: whatsappTarget.trim() } : {}),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no envio');
      setWeeks((prev) =>
        prev.map((w) =>
          w.id === currentWeek.id
            ? { ...w, sentToWhatsapp: true, sentAt: data.sentAt }
            : w
        )
      );
      addToast(`✅ Pauta enviada no WhatsApp para ${data.phone}!`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao enviar no WhatsApp.', 'error');
    } finally {
      setSendingWhatsapp(false);
    }
  };

  const handleAddKpi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kpiForm.weekStart) {
      addToast('Informe a data da semana para registrar os KPIs.', 'warning');
      return;
    }
    setSavingKpi(true);
    try {
      const parseNum = (v: string) => Number(String(v || '0').replace(',', '.')) || 0;
      const res = await fetch('/api/marketing/social-growth/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart: kpiForm.weekStart,
          followersCount: parseNum(kpiForm.followersCount),
          localReach: parseNum(kpiForm.localReach),
          profileVisits: parseNum(kpiForm.profileVisits),
          bioClicks: parseNum(kpiForm.bioClicks),
          whatsappOrders: parseNum(kpiForm.whatsappOrders),
          googleReviews: parseNum(kpiForm.googleReviews),
          adSpend: parseNum(kpiForm.adSpend),
          notes: kpiForm.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.kpi) throw new Error(data.error || 'Falha ao salvar KPI');
      setKpis((prev) => [data.kpi, ...prev]);
      setKpiForm((prev) => ({
        ...prev,
        followersCount: '',
        localReach: '',
        profileVisits: '',
        bioClicks: '',
        whatsappOrders: '',
        googleReviews: '',
        adSpend: '',
        notes: '',
      }));
      addToast('📊 KPI semanal registrado com sucesso!', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao registrar KPI.', 'error');
    } finally {
      setSavingKpi(false);
    }
  };

  const handleConfirmDeleteKpi = async () => {
    if (!kpiToDelete) return;
    setDeletingKpi(true);
    try {
      const res = await fetch(`/api/marketing/social-growth/kpis/${kpiToDelete.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Falha ao excluir KPI');
      setKpis((prev) => prev.filter((item) => item.id !== kpiToDelete.id));
      setKpiToDelete(null);
      addToast('Registro semanal removido.', 'info');
    } catch {
      addToast('Erro ao remover registro de KPI.', 'error');
    } finally {
      setDeletingKpi(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await fetch('/api/marketing/social-growth/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok || !data.config) throw new Error(data.error || 'Erro ao salvar configuração');
      setConfig({ ...DEFAULT_CONFIG, ...data.config });
      addToast('✅ Configuração salva e sincronizada com /bio e Encartes!', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Erro ao salvar configuração.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-7 h-7 animate-spin text-violet-500" aria-hidden="true" />
        <p className="text-sm font-bold text-slate-500">Carregando plano de Crescimento Social...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Barra de sub-painéis */}
      <nav
        aria-label="Sub-seções de Crescimento Social"
        className="flex flex-wrap gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-2xl shadow-sm"
      >
        {[
          { id: 'overview' as SubTab, label: 'Visão Geral & Plano 90d', icon: Rocket },
          { id: 'calendar' as SubTab, label: 'Calendário Semanal (Isa)', icon: Sparkles },
          { id: 'kpis' as SubTab, label: 'KPIs & Cliques /bio', icon: BarChart3 },
          { id: 'config' as SubTab, label: 'Configuração /bio & Artes', icon: Settings },
        ].map((item) => {
          const Icon = item.icon;
          const active = subTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSubTab(item.id)}
              className={`min-h-[44px] flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                active
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ─── SUB-PAINEL 1: VISÃO GERAL & PLANO 90 DIAS ──────────────────────── */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                Arrumação da Casa (Sem. 1–2)
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
                {completedChecklistCount}/{checklist.length}
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{
                    width: `${checklist.length ? Math.round((completedChecklistCount / checklist.length) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                Cliques no /bio (30 dias)
              </div>
              <div className="mt-2 text-2xl font-black text-violet-600 dark:text-violet-400 tabular-nums">
                {bioStats.total30Days}
              </div>
              <p className="mt-1 text-xs text-slate-500">Medição automática em tempo real</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                Pautas Semanais (Isa)
              </div>
              <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400 tabular-nums">
                {weeks.length}
              </div>
              <p className="mt-1 text-xs text-slate-500">Ritmo Sustentável (~2h/sem)</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                Último Registro Semanal
              </div>
              <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                {kpis[0] ? `${kpis[0].whatsappOrders} pedidos` : 'Sem registro'}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {kpis[0]
                  ? `${kpis[0].followersCount} seguidores • ${kpis[0].weekStart}`
                  : 'Registre toda segunda na aba KPIs'}
              </p>
            </div>
          </div>

          {/* Gerador Rápido de Links UTM + Preview /bio */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2
                  className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2"
                  style={{ textWrap: 'balance' }}
                >
                  <MousePointerClick className="w-5 h-5 text-violet-500 shrink-0" aria-hidden="true" />
                  <span>Links Rastreados (UTM) para Bio, Google e Stories</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Use cada link no canal certo para saber exatamente de onde vêm os cliques no <code>/bio</code>.
                </p>
              </div>
              <a
                href="/bio?utm_source=preview_painel"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity shrink-0"
              >
                <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Abrir /bio em nova aba</span>
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {utmLinks.map((lnk) => (
                <div
                  key={lnk.id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-700 dark:text-slate-200">
                      {lnk.label}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      {lnk.url}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText(lnk.url, lnk.label)}
                    className="min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-violet-400 text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copiar</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Checklist Semana 1 + Playbook Rápido */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div>
                <h2
                  className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2"
                  style={{ textWrap: 'balance' }}
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />
                  <span>Checklist — Arrumação da Casa (Semana 1 e 2)</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Conclua os itens da Semana 1 antes de ligar o tráfego pago hiperlocal.
                </p>
              </div>

              <div className="space-y-2.5">
                {checklist.map((item) => (
                  <label
                    key={item.id}
                    htmlFor={`${uid}-${item.id}`}
                    className={`min-h-[48px] flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${
                      item.completed
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
                        : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-violet-300'
                    }`}
                  >
                    <input
                      id={`${uid}-${item.id}`}
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => handleToggleChecklist(item.id, !item.completed)}
                      className="mt-0.5 w-5 h-5 accent-emerald-600 rounded shrink-0 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                          {item.phase}
                        </span>
                        <span
                          className={`text-sm font-bold ${
                            item.completed
                              ? 'line-through text-slate-400'
                              : 'text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          {item.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            {/* Playbook Rápido */}
            <aside className="lg:col-span-5 space-y-4">
              <div className="bg-gradient-to-br from-blue-950 to-slate-900 text-white rounded-3xl p-6 shadow-md space-y-3">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-black uppercase tracking-wider">
                  <Target className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Playbook Meta Ads Hiperlocal (Sem. 2+)</span>
                </div>
                <h3 className="text-base font-black" style={{ textWrap: 'balance' }}>
                  Verba: {fmtBRL(Number(config.monthlyAdBudget) || 450)}/mês • Raio 2–5 km do Ipiranga
                </h3>
                <ul className="text-xs text-blue-100 space-y-2 leading-relaxed">
                  <li>
                    <strong>Campanha 1 (40% verba):</strong> Visitas ao Perfil / Engajamento com os melhores Reels da semana.
                  </li>
                  <li>
                    <strong>Campanha 2 (60% verba):</strong> Conversas no WhatsApp ou Tráfego para <code>/bio</code> (Entrega Grátis, Cartão Brasil Card, Fraldas/Skincare).
                  </li>
                  <li>
                    <strong>Regra geográfica:</strong> Pino travado no Bairro Ipiranga (JF) cobrindo Zona Sul — nunca anunciar para o Brasil inteiro.
                  </li>
                </ul>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-3xl p-5 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-black uppercase tracking-wider">
                  <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Trava ANVISA (RDC 96/2008) & CRF-MG</span>
                </div>
                <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  Nunca postar ou impulsionar preço/promoção de medicamentos tarjados, receitas médicas ou incentivo à automedicação. Foque em{' '}
                  <strong>entrega grátis, Cartão Brasil Card, saúde preventiva, clima de JF, fraldas/infantil e dermocosméticos</strong>.
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-3xl p-5 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-wider">
                  <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Fase 2 (Backlog Futuro)</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Após estabilizar os primeiros 30–60 dias no digital: QR Codes no balcão/sacola, Grupo VIP de ofertas no WhatsApp, pedido de avaliação Google pós-entrega e parcerias no Ipiranga.
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* ─── SUB-PAINEL 2: CALENDÁRIO SEMANAL (ISA IA) ──────────────────────── */}
      {subTab === 'calendar' && (
        <div className="space-y-6">
          {/* Formulário de Geração */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <form
              aria-labelledby={`${uid}-gen-title`}
              onSubmit={handleGenerateWeek}
              className="space-y-4"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <h2
                    id={`${uid}-gen-title`}
                    className="text-lg font-black text-slate-900 dark:text-slate-100"
                    style={{ textWrap: 'balance' }}
                  >
                    Gerar Pauta Semanal com a Isa (Ritmo Sustentável)
                  </h2>
                  <label
                    htmlFor={`${uid}-focus-theme`}
                    className="block text-xs font-bold text-slate-600 dark:text-slate-300"
                  >
                    Foco opcional da semana (clima JF, categoria ou campanha)
                  </label>
                  <input
                    id={`${uid}-focus-theme`}
                    name="focusTheme"
                    type="text"
                    value={focusTheme}
                    onChange={(e) => setFocusTheme(e.target.value)}
                    placeholder="Ex: Frente fria em JF, Semana das Fraldas, Especial Cartão Brasil Card..."
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-violet-500 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={generatingWeek}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-black shadow-md transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  <span>{generatingWeek ? 'Isa criando pauta...' : 'Gerar Pauta da Semana'}</span>
                </button>
              </div>
            </form>

            {weeks.length > 0 && (
              <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label
                    htmlFor={`${uid}-week-select`}
                    className="text-xs font-bold text-slate-500 dark:text-slate-400"
                  >
                    Semana selecionada:
                  </label>
                  <select
                    id={`${uid}-week-select`}
                    value={currentWeek?.id || ''}
                    onChange={(e) => setSelectedWeekId(e.target.value)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100"
                  >
                    {weeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.weekLabel} {w.focusTheme ? `— ${w.focusTheme}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={`${uid}-wa-phone`} className="sr-only">
                    Telefone WhatsApp destino (opcional)
                  </label>
                  <input
                    id={`${uid}-wa-phone`}
                    type="tel"
                    inputMode="tel"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={whatsappTarget}
                    onChange={(e) => setWhatsappTarget(e.target.value)}
                    placeholder="WhatsApp (opcional)"
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 w-44"
                  />
                  <button
                    type="button"
                    onClick={handleSendWeekWhatsapp}
                    disabled={sendingWhatsapp || !currentWeek}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{sendingWhatsapp ? 'Enviando...' : 'Enviar pauta no WhatsApp'}</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {!currentWeek ? (
            <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-12 text-center space-y-2">
              <Sparkles className="w-8 h-8 text-violet-400 mx-auto" aria-hidden="true" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                Nenhuma pauta semanal gerada ainda.
              </p>
              <p className="text-xs text-slate-500">
                Clique em &ldquo;Gerar Pauta da Semana&rdquo; acima para a Isa criar os 3 posts do Feed/Reels, 5 Stories e atualização do Google Perfil.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Resumo da Semana */}
              <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/50 rounded-3xl p-5 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-black text-violet-900 dark:text-violet-200">
                    {currentWeek.plan.temaSemana || currentWeek.weekLabel}
                  </h3>
                  {currentWeek.climateContext && (
                    <span className="px-3 py-1 rounded-full bg-white/80 dark:bg-slate-900/70 text-[11px] font-bold text-violet-700 dark:text-violet-300">
                      🌤️ {currentWeek.climateContext}
                    </span>
                  )}
                </div>
                <p className="text-xs text-violet-800 dark:text-violet-300 leading-relaxed">
                  {currentWeek.plan.resumoEstrategico}
                </p>
              </div>

              {/* 3 Posts do Feed/Reels */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {(currentWeek.plan.postsFeed || []).map((post, idx) => {
                  const key = `feed_${post.id || idx}`;
                  const done = !!currentWeek.progress?.[key];
                  const copyBundle = `${post.titulo}\n\nGancho (3s): ${post.gancho3s}\n\nRoteiro/Slides:\n${post.roteiroOuSlides}\n\nLegenda:\n${post.legenda}\n\n${(post.hashtags || []).join(' ')}`;

                  return (
                    <article
                      key={key}
                      className={`bg-white dark:bg-slate-900 border rounded-3xl p-5 shadow-sm flex flex-col justify-between gap-4 ${
                        done
                          ? 'border-emerald-300 dark:border-emerald-800'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-black">
                            {post.dia} • {post.formato}
                          </span>
                          <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400">
                            {post.pilar}
                          </span>
                        </div>

                        <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 leading-snug">
                          {post.titulo}
                        </h4>

                        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50">
                          <div className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">
                            Gancho (3 primeiros segundos)
                          </div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                            &ldquo;{post.gancho3s}&rdquo;
                          </p>
                        </div>

                        <div>
                          <div className="text-[10px] font-black uppercase text-slate-400">
                            Roteiro / Slides
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed whitespace-pre-line">
                            {post.roteiroOuSlides}
                          </p>
                        </div>

                        <div>
                          <div className="text-[10px] font-black uppercase text-slate-400">
                            Legenda Pronta
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed whitespace-pre-line">
                            {post.legenda}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {(post.hashtags || []).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded-md"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-[11px] text-amber-800 dark:text-amber-200">
                          <strong>ANVISA:</strong> {post.alertaAnvisa}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                        <label className="min-h-[44px] inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={() => handleToggleWeekProgress(currentWeek, key)}
                            className="w-4 h-4 accent-emerald-600 cursor-pointer"
                          />
                          <span>Concluído</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleCopyText(copyBundle, `Roteiro e legenda (${post.dia})`)}
                          className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Copiar</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Stories Seg-Sex + Google Perfil + Tráfego Pago */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
                  <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Instagram className="w-4 h-4 text-pink-500 shrink-0" aria-hidden="true" />
                    <span>Roteiro Rápido de Stories (Seg a Sex)</span>
                  </h4>
                  <div className="space-y-2">
                    {(currentWeek.plan.stories || []).map((st, idx) => {
                      const key = `story_${idx}`;
                      const done = !!currentWeek.progress?.[key];
                      return (
                        <label
                          key={key}
                          className="min-h-[44px] flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={() => handleToggleWeekProgress(currentWeek, key)}
                            className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0"
                          />
                          <div className="text-xs leading-relaxed">
                            <strong className="text-slate-800 dark:text-slate-100">{st.dia}:</strong>{' '}
                            <span className="text-slate-600 dark:text-slate-300">{st.ideia}</span>
                            <div className="text-[11px] font-bold text-violet-600 dark:text-violet-400 mt-0.5">
                              CTA: {st.cta}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>

                <div className="lg:col-span-5 space-y-5">
                  <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-red-500 shrink-0" aria-hidden="true" />
                        <span>Post Semanal — Google Perfil</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            `${currentWeek.plan.googlePerfil?.titulo || ''}\n\n${currentWeek.plan.googlePerfil?.texto || ''}`,
                            'Post do Google Perfil'
                          )
                        }
                        className="min-h-[44px] px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copiar</span>
                      </button>
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {currentWeek.plan.googlePerfil?.titulo}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {currentWeek.plan.googlePerfil?.texto}
                    </p>
                    <label className="min-h-[44px] inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!currentWeek.progress?.google_post}
                        onChange={() => handleToggleWeekProgress(currentWeek, 'google_post')}
                        className="w-4 h-4 accent-emerald-600"
                      />
                      <span>Publicado no Google Perfil</span>
                    </label>
                  </section>

                  <section className="bg-slate-900 text-white rounded-3xl p-5 shadow-sm space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-300">
                      Sugestão de Impulsionamento Local
                    </h4>
                    <p className="text-xs text-slate-200">
                      <strong>Objetivo:</strong> {currentWeek.plan.sugestaoTrafegoPago?.objetivo}
                    </p>
                    <p className="text-xs text-slate-300">
                      <strong>Público:</strong> {currentWeek.plan.sugestaoTrafegoPago?.publico}
                    </p>
                    <p className="text-xs text-slate-300">
                      <strong>Verba:</strong> {currentWeek.plan.sugestaoTrafegoPago?.verbaSugerida}
                    </p>
                    <p className="text-xs text-emerald-300">
                      <strong>Criativo:</strong> {currentWeek.plan.sugestaoTrafegoPago?.ideiaCriativo}
                    </p>
                  </section>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── SUB-PAINEL 3: KPIs & CLIQUES NO /BIO ───────────────────────────── */}
      {subTab === 'kpis' && (
        <div className="space-y-6">
          {/* Cliques /bio por botão e origem */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                Cliques no /bio por Botão (30 dias)
              </h3>
              {bioStats.byButton.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhum clique registrado nos últimos 30 dias.</p>
              ) : (
                <div className="space-y-2">
                  {bioStats.byButton.map((item) => (
                    <div
                      key={item.buttonId}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs"
                    >
                      <span className="font-bold text-slate-700 dark:text-slate-200 truncate">
                        {item.buttonLabel || item.buttonId}
                      </span>
                      <span className="font-black text-violet-600 dark:text-violet-400 tabular-nums shrink-0">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                Origem dos Acessos ao /bio (utm_source)
              </h3>
              {bioStats.bySource.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhuma origem registrada nos últimos 30 dias.</p>
              ) : (
                <div className="space-y-2">
                  {bioStats.bySource.map((item) => (
                    <div
                      key={item.source}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs"
                    >
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {item.source}
                      </span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Formulário Semântico de Registro Semanal de KPIs */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <form
              aria-labelledby={`${uid}-kpi-form-title`}
              onSubmit={handleAddKpi}
              className="space-y-4"
            >
              <div>
                <h3
                  id={`${uid}-kpi-form-title`}
                  className="text-base font-black text-slate-900 dark:text-slate-100"
                >
                  Registrar Medição Semanal (Toda Segunda-feira)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Acompanhe os resultados reais dos 90 dias em 15 minutos por semana.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label htmlFor={`${uid}-kpi-week`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Início da Semana <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id={`${uid}-kpi-week`}
                    name="weekStart"
                    type="date"
                    required
                    value={kpiForm.weekStart}
                    onChange={(e) => setKpiForm((p) => ({ ...p, weekStart: e.target.value }))}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-kpi-followers`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Seguidores (Instagram)
                  </label>
                  <input
                    id={`${uid}-kpi-followers`}
                    name="followersCount"
                    type="text"
                    inputMode="numeric"
                    value={kpiForm.followersCount}
                    onChange={(e) => setKpiForm((p) => ({ ...p, followersCount: e.target.value }))}
                    placeholder="Ex: 1250"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-kpi-reach`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Alcance Local (7 dias)
                  </label>
                  <input
                    id={`${uid}-kpi-reach`}
                    name="localReach"
                    type="text"
                    inputMode="numeric"
                    value={kpiForm.localReach}
                    onChange={(e) => setKpiForm((p) => ({ ...p, localReach: e.target.value }))}
                    placeholder="Ex: 3800"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-kpi-visits`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Visitas ao Perfil
                  </label>
                  <input
                    id={`${uid}-kpi-visits`}
                    name="profileVisits"
                    type="text"
                    inputMode="numeric"
                    value={kpiForm.profileVisits}
                    onChange={(e) => setKpiForm((p) => ({ ...p, profileVisits: e.target.value }))}
                    placeholder="Ex: 240"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-kpi-bioclicks`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Cliques no /bio (semana)
                  </label>
                  <input
                    id={`${uid}-kpi-bioclicks`}
                    name="bioClicks"
                    type="text"
                    inputMode="numeric"
                    value={kpiForm.bioClicks}
                    onChange={(e) => setKpiForm((p) => ({ ...p, bioClicks: e.target.value }))}
                    placeholder="Ex: 38"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-kpi-orders`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Pedidos vindos das redes
                  </label>
                  <input
                    id={`${uid}-kpi-orders`}
                    name="whatsappOrders"
                    type="text"
                    inputMode="numeric"
                    value={kpiForm.whatsappOrders}
                    onChange={(e) => setKpiForm((p) => ({ ...p, whatsappOrders: e.target.value }))}
                    placeholder="Ex: 14"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-kpi-reviews`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Avaliações Google (total)
                  </label>
                  <input
                    id={`${uid}-kpi-reviews`}
                    name="googleReviews"
                    type="text"
                    inputMode="numeric"
                    value={kpiForm.googleReviews}
                    onChange={(e) => setKpiForm((p) => ({ ...p, googleReviews: e.target.value }))}
                    placeholder="Ex: 62"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor={`${uid}-kpi-spend`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Investimento Meta Ads (R$)
                  </label>
                  <input
                    id={`${uid}-kpi-spend`}
                    name="adSpend"
                    type="text"
                    inputMode="decimal"
                    value={kpiForm.adSpend}
                    onChange={(e) => setKpiForm((p) => ({ ...p, adSpend: e.target.value }))}
                    placeholder="Ex: 110.00"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1">
                  <label htmlFor={`${uid}-kpi-notes`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Observações da semana (criativo vencedor, aprendizado)
                  </label>
                  <input
                    id={`${uid}-kpi-notes`}
                    name="notes"
                    type="text"
                    value={kpiForm.notes}
                    onChange={(e) => setKpiForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Ex: Reels sobre clima de JF trouxe várias mensagens de entrega grátis..."
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingKpi}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-black cursor-pointer shrink-0"
                >
                  {savingKpi ? 'Salvando...' : 'Registrar Semana'}
                </button>
              </div>
            </form>
          </section>

          {/* Tabela Responsiva de Histórico de KPIs */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-3">
            <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
              Histórico Semanal de Resultados
            </h3>

            <div
              tabIndex={0}
              role="region"
              aria-label="Histórico semanal de KPIs sociais"
              className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800"
            >
              <table className="w-full text-left border-collapse text-xs">
                <caption className="sr-only">
                  Evolução semanal de seguidores, alcance local, cliques no link da bio, pedidos e anúncios
                </caption>
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3 font-black uppercase tracking-wider whitespace-nowrap">Semana</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider whitespace-nowrap text-right">Seguidores</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider whitespace-nowrap text-right">Alcance</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider whitespace-nowrap text-right">Visitas Perfil</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider whitespace-nowrap text-right">Cliques /bio</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider whitespace-nowrap text-right">Pedidos</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider whitespace-nowrap text-right">Google ★</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider whitespace-nowrap text-right">Ads (R$)</th>
                    <th className="px-4 py-3 font-black uppercase tracking-wider whitespace-nowrap">Notas</th>
                    <th className="px-3 py-3 font-black uppercase tracking-wider whitespace-nowrap text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {kpis.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-400 italic">
                        Nenhum KPI registrado ainda. Use o formulário acima toda segunda-feira.
                      </td>
                    </tr>
                  ) : (
                    kpis.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                          {row.weekStart}
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums">{row.followersCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.localReach}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.profileVisits}</td>
                        <td className="px-4 py-3 text-right font-bold text-violet-600 dark:text-violet-400 tabular-nums">
                          {row.bioClicks}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {row.whatsappOrders}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.googleReviews}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(row.adSpend)}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[220px] truncate" title={row.notes || ''}>
                          {row.notes || '—'}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setKpiToDelete(row)}
                            title="Excluir registro semanal"
                            aria-label={`Excluir medição da semana ${row.weekStart}`}
                            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ─── SUB-PAINEL 4: CONFIGURAÇÃO /BIO & ARTES ────────────────────────── */}
      {subTab === 'config' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
          <form
            aria-labelledby={`${uid}-cfg-title`}
            onSubmit={handleSaveConfig}
            className="space-y-6"
          >
            <div>
              <h2
                id={`${uid}-cfg-title`}
                className="text-lg font-black text-slate-900 dark:text-slate-100"
                style={{ textWrap: 'balance' }}
              >
                Dados Públicos da Loja (Sincroniza /bio + Encartes/Artes)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Qualquer atualização feita aqui reflete automaticamente na página <code>/bio</code> e no rodapé das artes e tabloides do sistema.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor={`${uid}-cfg-ig`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Instagram Oficial (@)
                </label>
                <input
                  id={`${uid}-cfg-ig`}
                  name="instagramHandle"
                  type="text"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={config.instagramHandle}
                  onChange={(e) => setConfig((p) => ({ ...p, instagramHandle: e.target.value }))}
                  placeholder="@belafarmasul"
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-cfg-wa-disp`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  WhatsApp Exibição
                </label>
                <input
                  id={`${uid}-cfg-wa-disp`}
                  name="whatsappDisplay"
                  type="tel"
                  inputMode="tel"
                  value={config.whatsappDisplay}
                  onChange={(e) => setConfig((p) => ({ ...p, whatsappDisplay: e.target.value }))}
                  placeholder="(32) 99822-8189"
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-cfg-wa-num`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  WhatsApp Link Direto (apenas dígitos com 55)
                </label>
                <input
                  id={`${uid}-cfg-wa-num`}
                  name="whatsappNumber"
                  type="tel"
                  inputMode="numeric"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={config.whatsappNumber}
                  onChange={(e) => setConfig((p) => ({ ...p, whatsappNumber: e.target.value }))}
                  placeholder="5532998228189"
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-cfg-hours`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Horário de Funcionamento
                </label>
                <input
                  id={`${uid}-cfg-hours`}
                  name="openingHours"
                  type="text"
                  value={config.openingHours}
                  onChange={(e) => setConfig((p) => ({ ...p, openingHours: e.target.value }))}
                  placeholder="Seg–Sáb 07h30 às 20h • Dom 07h30 às 13h"
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor={`${uid}-cfg-addr`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Endereço da Loja (Rua, Número, Bairro, Cidade)
                </label>
                <input
                  id={`${uid}-cfg-addr`}
                  name="storeAddress"
                  type="text"
                  value={config.storeAddress}
                  onChange={(e) => setConfig((p) => ({ ...p, storeAddress: e.target.value }))}
                  placeholder="Bairro Ipiranga, Juiz de Fora - MG"
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor={`${uid}-cfg-pay`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Formas de Pagamento (destaque Cartão Brasil Card)
                </label>
                <input
                  id={`${uid}-cfg-pay`}
                  name="paymentsText"
                  type="text"
                  value={config.paymentsText}
                  onChange={(e) => setConfig((p) => ({ ...p, paymentsText: e.target.value }))}
                  placeholder="Cartão Brasil Card • Pix • Crédito/Débito • Dinheiro"
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-cfg-head`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Título Principal da Página /bio
                </label>
                <input
                  id={`${uid}-cfg-head`}
                  name="bioHeadline"
                  type="text"
                  value={config.bioHeadline}
                  onChange={(e) => setConfig((p) => ({ ...p, bioHeadline: e.target.value }))}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-cfg-sub`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Subtítulo da Página /bio
                </label>
                <input
                  id={`${uid}-cfg-sub`}
                  name="bioSubheadline"
                  type="text"
                  value={config.bioSubheadline}
                  onChange={(e) => setConfig((p) => ({ ...p, bioSubheadline: e.target.value }))}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-cfg-maps`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Link do Google Maps (Como Chegar)
                </label>
                <input
                  id={`${uid}-cfg-maps`}
                  name="googleMapsUrl"
                  type="url"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={config.googleMapsUrl}
                  onChange={(e) => setConfig((p) => ({ ...p, googleMapsUrl: e.target.value }))}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-cfg-rev`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Link Direto de Avaliação Google (opcional)
                </label>
                <input
                  id={`${uid}-cfg-rev`}
                  name="googleReviewUrl"
                  type="url"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={config.googleReviewUrl}
                  onChange={(e) => setConfig((p) => ({ ...p, googleReviewUrl: e.target.value }))}
                  placeholder="https://g.page/r/..."
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-cfg-ifood`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Link da Loja no iFood (opcional)
                </label>
                <input
                  id={`${uid}-cfg-ifood`}
                  name="ifoodUrl"
                  type="url"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={config.ifoodUrl}
                  onChange={(e) => setConfig((p) => ({ ...p, ifoodUrl: e.target.value }))}
                  placeholder="https://www.ifood.com.br/..."
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-cfg-budget`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Verba Mensal de Anúncios Meta Ads (R$)
                </label>
                <input
                  id={`${uid}-cfg-budget`}
                  name="monthlyAdBudget"
                  type="text"
                  inputMode="decimal"
                  value={String(config.monthlyAdBudget ?? 450)}
                  onChange={(e) =>
                    setConfig((p) => ({
                      ...p,
                      monthlyAdBudget: Number(e.target.value.replace(',', '.')) || 0,
                    }))
                  }
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>
            </div>

            <fieldset className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
              <legend className="text-xs font-black uppercase tracking-wider text-slate-500 px-1">
                Opções exibidas na página pública /bio
              </legend>

              <div className="flex flex-wrap gap-6 pt-1">
                <div className="inline-flex items-center gap-2 min-h-[44px]">
                  <input
                    id={`${uid}-cfg-show-hours`}
                    name="showHours"
                    type="checkbox"
                    checked={config.showHours}
                    onChange={(e) => setConfig((p) => ({ ...p, showHours: e.target.checked }))}
                    className="w-5 h-5 accent-violet-600 cursor-pointer"
                  />
                  <label htmlFor={`${uid}-cfg-show-hours`} className="text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                    Exibir horário de funcionamento
                  </label>
                </div>

                <div className="inline-flex items-center gap-2 min-h-[44px]">
                  <input
                    id={`${uid}-cfg-show-bc`}
                    name="showBrasilCard"
                    type="checkbox"
                    checked={config.showBrasilCard}
                    onChange={(e) => setConfig((p) => ({ ...p, showBrasilCard: e.target.checked }))}
                    className="w-5 h-5 accent-violet-600 cursor-pointer"
                  />
                  <label htmlFor={`${uid}-cfg-show-bc`} className="text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                    Destacar Cartão Brasil Card
                  </label>
                </div>

                <div className="inline-flex items-center gap-2 min-h-[44px]">
                  <input
                    id={`${uid}-cfg-show-ifood`}
                    name="showIfood"
                    type="checkbox"
                    checked={config.showIfood}
                    onChange={(e) => setConfig((p) => ({ ...p, showIfood: e.target.checked }))}
                    className="w-5 h-5 accent-violet-600 cursor-pointer"
                  />
                  <label htmlFor={`${uid}-cfg-show-ifood`} className="text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                    Exibir botão do iFood (quando link preenchido)
                  </label>
                </div>
              </div>
            </fieldset>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingConfig}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-black shadow-md cursor-pointer"
              >
                {savingConfig ? 'Salvando...' : 'Salvar e Sincronizar /bio & Artes'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Modal de Confirmação de Exclusão de KPI (sem alert/window.confirm) */}
      {kpiToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${uid}-del-kpi-title`}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3
                id={`${uid}-del-kpi-title`}
                className="text-base font-black text-slate-900 dark:text-slate-100"
              >
                Confirmar exclusão do registro
              </h3>
              <button
                type="button"
                onClick={() => setKpiToDelete(null)}
                aria-label="Fechar confirmação"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Deseja remover a medição da semana <strong>{kpiToDelete.weekStart}</strong> ({kpiToDelete.followersCount} seguidores, {kpiToDelete.whatsappOrders} pedidos)? Essa ação não pode ser desfeita.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setKpiToDelete(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteKpi}
                disabled={deletingKpi}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-black cursor-pointer"
              >
                {deletingKpi ? 'Removendo...' : 'Excluir registro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
