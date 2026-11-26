import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  GitBranch,
  GitCommit,
  Globe,
  History,
  Info,
  Layers,
  Mail,
  MapPin,
  MessageCircle,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  User as UserIcon,
  Wrench,
  AlertCircle,
} from 'lucide-react';
import { BelaFarmaLogo } from './BelaFarmaLogo';

interface AboutProjectProps {
  onOpenVersionModal?: () => void;
}

interface CommitItem {
  sha: string;
  shortHash: string;
  title: string;
  description: string;
  fullMessage: string;
  authorName: string;
  authorLogin?: string;
  authorAvatar?: string | null;
  date: string | null;
  htmlUrl: string;
}

interface DeveloperInfo {
  name: string;
  displayName: string;
  role: string;
  avatarUrl: string;
  bio: string;
  location: string;
  whatsapp: string;
  whatsappUrl: string;
  email: string;
  githubUsername: string;
  githubUrl: string;
  portfolioUrl: string;
  publicRepos: number | null;
}

interface RepositoryInfo {
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  language: string;
  visibility: string;
  stargazersCount: number;
  forksCount: number;
  topics: string[];
  pushedAt: string | null;
  createdAt: string | null;
  githubDescription: string | null;
  fallbackDescription: string;
}

interface AboutPayload {
  success: boolean;
  source: 'github' | 'git-local' | 'fallback';
  fetchedAt: string;
  appVersion: string;
  cached?: boolean;
  developer: DeveloperInfo;
  repository: RepositoryInfo;
  commits: CommitItem[];
}

type CommitCategory = 'all' | 'feat' | 'fix' | 'other';

interface ParsedCommitSubject {
  category: Exclude<CommitCategory, 'all'>;
  badgeLabel: string;
  scope: string | null;
  cleanTitle: string;
}

const DEFAULT_FALLBACK_DATA: AboutPayload = {
  success: true,
  source: 'fallback',
  fetchedAt: new Date().toISOString(),
  appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.2.6',
  developer: {
    name: 'Edevaldo Cruz Antonio',
    displayName: 'Edevaldo Cruz',
    role: 'Desenvolvedor Full-Stack & Criador do BelaFarma',
    avatarUrl: 'https://avatars.githubusercontent.com/u/77896103?v=4',
    bio: 'Responsável pela arquitetura, automações, integrações ERP/PDV, Inteligência Artificial e operação contínua do ecossistema BelaFarma (Belinha).',
    location: 'Minas Gerais, Brasil',
    whatsapp: '(32) 98863-4755',
    whatsappUrl: 'https://wa.me/5532988634755?text=Ol%C3%A1%20Edevaldo%2C%20vi%20seu%20contato%20na%20p%C3%A1gina%20Sobre%20do%20BelaFarma!',
    email: 'edevaldo_cruz@hotmail.com',
    githubUsername: 'Edevaldo-Cruz',
    githubUrl: 'https://github.com/Edevaldo-Cruz',
    portfolioUrl: 'https://ecrz-portifolio.netlify.app/',
    publicRepos: null,
  },
  repository: {
    name: 'BelaFarma',
    fullName: 'Edevaldo-Cruz/BelaFarma',
    htmlUrl: 'https://github.com/Edevaldo-Cruz/BelaFarma',
    defaultBranch: 'main',
    language: 'TypeScript',
    visibility: 'public',
    stargazersCount: 0,
    forksCount: 0,
    topics: [],
    pushedAt: null,
    createdAt: null,
    githubDescription: null,
    fallbackDescription:
      'Sistema integrado de gestão farmacêutica (Belinha / BelaFarma) com PDV, integração Digifarma, cotações automatizadas BelaPed, controle financeiro, conciliação bancária, crediário, automações WhatsApp e consultoria por Inteligência Artificial.',
  },
  commits: (typeof __RECENT_COMMITS__ !== 'undefined' && Array.isArray(__RECENT_COMMITS__)
    ? __RECENT_COMMITS__
    : []
  ).map((c) => ({
    sha: c.hash,
    shortHash: c.hash,
    title: c.message,
    description: '',
    fullMessage: c.message,
    authorName: 'Edevaldo-Cruz',
    authorLogin: 'Edevaldo-Cruz',
    authorAvatar: null,
    date: c.date || null,
    htmlUrl: `https://github.com/Edevaldo-Cruz/BelaFarma/commit/${c.hash}`,
  })),
};

function parseConventionalCommit(rawTitle: string): ParsedCommitSubject {
  const trimmed = (rawTitle || '').trim();
  const match = trimmed.match(/^([a-zA-Z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/);
  if (!match) {
    return {
      category: 'other',
      badgeLabel: 'Atualização',
      scope: null,
      cleanTitle: trimmed || 'Atualização do sistema',
    };
  }

  const rawType = match[1].toLowerCase();
  const scope = match[2] ? match[2].trim() : null;
  const cleanTitle = match[3].trim();

  if (rawType === 'feat') {
    return { category: 'feat', badgeLabel: 'Novidade', scope, cleanTitle };
  }
  if (rawType === 'fix') {
    return { category: 'fix', badgeLabel: 'Correção', scope, cleanTitle };
  }

  const typeLabels: Record<string, string> = {
    refactor: 'Refatoração',
    perf: 'Performance',
    style: 'Visual',
    docs: 'Documentação',
    chore: 'Manutenção',
    test: 'Testes',
    build: 'Build',
    ci: 'CI/CD',
  };

  return {
    category: 'other',
    badgeLabel: typeLabels[rawType] || 'Melhoria',
    scope,
    cleanTitle,
  };
}

function formatCommitDate(rawDate: string | null): { formatted: string; relative: string } {
  if (!rawDate) return { formatted: 'Data indisponível', relative: '' };

  // Trata datas no formato dd/MM/yyyy vindas do fallback do Vite
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
    return { formatted: rawDate, relative: '' };
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    return { formatted: rawDate, relative: '' };
  }

  const formatted = parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const diffMs = Date.now() - parsed.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  let relative = '';

  if (diffMin < 1) {
    relative = 'agora';
  } else if (diffMin < 60) {
    relative = `há ${diffMin} min`;
  } else {
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      relative = `há ${diffHours}h`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      relative = diffDays === 1 ? 'há 1 dia' : `há ${diffDays} dias`;
    }
  }

  return { formatted, relative };
}

function legacyCopy(text: string): boolean {
  const previousFocus = document.activeElement as HTMLElement | null;
  const field = Object.assign(document.createElement('textarea'), { value: text });
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0;pointer-events:none';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
    previousFocus?.focus?.({ preventScroll: true });
  }
}

interface CopyTargetButtonProps {
  targetId: string;
  ariaLabel: string;
  className?: string;
}

const CopyTargetButton: React.FC<CopyTargetButtonProps> = ({
  targetId,
  ariaLabel,
  className = '',
}) => {
  return (
    <span className="relative inline-flex items-center shrink-0">
      <button
        type="button"
        {...({ command: '--copy', commandfor: targetId } as any)}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={`group/copy inline-flex items-center justify-center min-w-[28px] min-h-[28px] p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer data-[copied]:border-emerald-500/60 data-[copied]:text-emerald-600 dark:data-[copied]:text-emerald-400 data-[failed]:border-rose-500/60 data-[failed]:text-rose-600 ${className}`}
      >
        <Copy
          aria-hidden="true"
          className="w-3.5 h-3.5 group-data-[copied]/copy:hidden"
        />
        <Check
          aria-hidden="true"
          className="w-3.5 h-3.5 hidden group-data-[copied]/copy:block"
        />
      </button>
      <span
        role="status"
        className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 dark:bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-white dark:text-slate-900 opacity-0 transition-opacity duration-150"
        style={{ zIndex: 20 }}
      />
    </span>
  );
};

export const AboutProject: React.FC<AboutProjectProps> = ({ onOpenVersionModal }) => {
  const idPrefix = useId();
  const [data, setData] = useState<AboutPayload>(DEFAULT_FALLBACK_DATA);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<CommitCategory>('all');
  const [avatarFailed, setAvatarFailed] = useState<boolean>(false);

  const localCommitHash = typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev';

  // Wire global Invoker Commands (--copy) with Clipboard API + fallback para navegadores sem CommandEvent
  useEffect(() => {
    const timers = new WeakMap<Element, number>();
    let lastAnnouncement = '';

    const report = (button: Element, ok: boolean) => {
      const tip = button.nextElementSibling as HTMLElement | null;
      const existingTimer = timers.get(button);
      if (existingTimer) window.clearTimeout(existingTimer);

      button.removeAttribute('data-copied');
      button.removeAttribute('data-failed');

      let message = ok ? 'Copiado' : 'Falha ao copiar';
      if (message === lastAnnouncement) {
        message += '\u00A0';
      }
      lastAnnouncement = message;

      if (tip) {
        tip.textContent = '';
        tip.style.opacity = '0';
      }

      void (button as HTMLElement).offsetWidth;
      button.setAttribute(ok ? 'data-copied' : 'data-failed', '');

      if (tip) {
        tip.style.opacity = '1';
        requestAnimationFrame(() => {
          tip.textContent = message;
        });
      }

      const timer = window.setTimeout(() => {
        button.removeAttribute('data-copied');
        button.removeAttribute('data-failed');
        if (tip) {
          tip.style.opacity = '0';
          tip.textContent = '';
        }
      }, 1800);

      timers.set(button, timer);
    };

    const copyFromTarget = async (button: Element, target: HTMLElement | null) => {
      if (!target) return;
      const text =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
          ? target.value.trim()
          : (target.dataset.copyValue || target.innerText || '').trim();
      if (!text) return;

      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(text);
        } else if (!legacyCopy(text)) {
          throw new Error('Copy failed');
        }
        report(button, true);
      } catch {
        try {
          if (legacyCopy(text)) {
            report(button, true);
          } else {
            report(button, false);
          }
        } catch {
          report(button, false);
        }
      }
    };

    const onCommand = (event: Event) => {
      const cmdEvent = event as Event & {
        command?: string;
        source?: Element | null;
        target?: EventTarget | null;
      };
      if (cmdEvent.command && cmdEvent.command.startsWith('--copy') && cmdEvent.source) {
        const target =
          cmdEvent.target instanceof HTMLElement
            ? cmdEvent.target
            : document.getElementById(cmdEvent.source.getAttribute('commandfor') || '');
        copyFromTarget(cmdEvent.source, target);
      }
    };

    const onFallbackClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const targetEl = event.target as Element | null;
      const button = targetEl?.closest('button[command^="--copy"]');
      if (!button) return;
      const targetId = button.getAttribute('commandfor');
      if (!targetId) return;
      const target = document.getElementById(targetId);
      copyFromTarget(button, target);
    };

    const supportsInvoker = 'CommandEvent' in window;
    if (supportsInvoker) {
      document.addEventListener('command', onCommand, true);
    } else {
      document.addEventListener('click', onFallbackClick);
    }

    return () => {
      if (supportsInvoker) {
        document.removeEventListener('command', onCommand, true);
      } else {
        document.removeEventListener('click', onFallbackClick);
      }
    };
  }, []);

  const fetchAboutData = async (forceRefresh = false) => {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setFetchError(null);

    try {
      const url = forceRefresh ? '/api/system/about?refresh=1' : '/api/system/about';
      const res = await fetch(url, { cache: forceRefresh ? 'no-store' : 'default' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: AboutPayload = await res.json();
      if (json && json.success) {
        setData(json);
        setAvatarFailed(false);
      }
    } catch (err: any) {
      setFetchError(
        'Não foi possível consultar a API agora; exibindo os dados embarcados desta compilação.'
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAboutData(false);
  }, []);

  const parsedCommits = useMemo(() => {
    return (data.commits || []).slice(0, 20).map((commit) => ({
      commit,
      parsed: parseConventionalCommit(commit.title),
    }));
  }, [data.commits]);

  const categoryCounts = useMemo(() => {
    const counts = { all: parsedCommits.length, feat: 0, fix: 0, other: 0 };
    parsedCommits.forEach(({ parsed }) => {
      counts[parsed.category] += 1;
    });
    return counts;
  }, [parsedCommits]);

  const filteredCommits = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return parsedCommits.filter(({ commit, parsed }) => {
      if (categoryFilter !== 'all' && parsed.category !== categoryFilter) {
        return false;
      }
      if (!term) return true;
      return (
        commit.title.toLowerCase().includes(term) ||
        commit.description.toLowerCase().includes(term) ||
        commit.shortHash.toLowerCase().includes(term) ||
        commit.authorName.toLowerCase().includes(term) ||
        (parsed.scope && parsed.scope.toLowerCase().includes(term))
      );
    });
  }, [parsedCommits, categoryFilter, searchTerm]);

  const sourceBadge = useMemo(() => {
    if (data.source === 'github') {
      return {
        label: data.cached ? 'GitHub (cache 5m)' : 'GitHub ao vivo',
        className:
          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80',
      };
    }
    if (data.source === 'git-local') {
      return {
        label: 'Git local',
        className:
          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/80',
      };
    }
    return {
      label: 'Build local',
      className:
        'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    };
  }, [data.source, data.cached]);

  const repoUrlTargetId = `${idPrefix}-repo-url`;
  const whatsappTargetId = `${idPrefix}-dev-whatsapp`;
  const emailTargetId = `${idPrefix}-dev-email`;

  const techStack = [
    'React 19',
    'TypeScript',
    'Tailwind CSS',
    'Vite',
    'Node.js / Express',
    'SQLite + Firebird',
    'Gemini AI',
    'WhatsApp Baileys',
  ];

  const pushedAtFormatted = useMemo(() => {
    if (!data.repository.pushedAt) return null;
    const d = new Date(data.repository.pushedAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [data.repository.pushedAt]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8 animate-in fade-in duration-300">
      {/* Cabeçalho / Hero */}
      <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-5 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 w-fit">
              <BelaFarmaLogo size="md" showSubtext />
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/80">
                  <Info className="w-3.5 h-3.5" />
                  Sobre o Projeto
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800/80">
                  v{data.appVersion}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                  #{localCommitHash}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${sourceBadge.className}`}>
                  {sourceBadge.label}
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight [text-wrap:balance]">
                Sistema BelaFarma (Belinha) — Documentação, Contato & Atualizações
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 [text-wrap:pretty] max-w-2xl">
                Informações oficiais do repositório no GitHub, canais diretos com o desenvolvedor e o registro das últimas 20 atualizações entregues.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => fetchAboutData(true)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer disabled:opacity-60 active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Sincronizando...' : 'Atualizar do GitHub'}</span>
            </button>

            {onOpenVersionModal && (
              <button
                type="button"
                onClick={onOpenVersionModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all cursor-pointer active:scale-95"
              >
                <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>Versão & Cache</span>
              </button>
            )}
          </div>
        </div>

        {fetchError && (
          <div className="mt-4 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-800 dark:text-amber-200 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{fetchError}</span>
          </div>
        )}
      </section>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: GitHub + Desenvolvedor */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Repositório & Descrição do GitHub */}
          <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white shadow-sm">
                  <Code2 className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white [text-wrap:balance]">
                    Repositório & Descrição do GitHub
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Código-fonte oficial e metadados do projeto
                  </p>
                </div>
              </div>

              <a
                href={data.repository.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 transition-colors shrink-0"
              >
                <span>GitHub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* URL copiável do repositório */}
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Repositório Oficial
                </span>
                <a
                  id={repoUrlTargetId}
                  data-copy-value={data.repository.htmlUrl}
                  href={data.repository.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs sm:text-sm font-mono font-bold text-cyan-700 dark:text-cyan-400 hover:underline truncate block"
                >
                  {data.repository.fullName}
                </a>
              </div>
              <CopyTargetButton
                targetId={repoUrlTargetId}
                ariaLabel="Copiar URL do repositório GitHub"
              />
            </div>

            {/* Descrição vinda do GitHub */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/70 dark:from-slate-800/60 dark:to-slate-900 border border-slate-200/80 dark:border-slate-700/70 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Descrição do GitHub
                </span>
                {data.repository.githubDescription ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Sincronizada do GitHub
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Resumo padrão do sistema
                  </span>
                )}
              </div>

              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-medium [text-wrap:pretty]">
                {data.repository.githubDescription || data.repository.fallbackDescription}
              </p>

              {!data.repository.githubDescription && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug pt-1 border-t border-slate-200/70 dark:border-slate-700/70 [text-wrap:pretty]">
                  O campo <em>About / Description</em> no repositório do GitHub está vazio no momento. Quando for preenchido lá, esta página exibirá o texto automaticamente.
                </p>
              )}
            </div>

            {/* Metadados do repositório */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  <GitBranch className="w-3 h-3 text-cyan-500" />
                  Branch
                </span>
                <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-200 mt-0.5 block">
                  {data.repository.defaultBranch}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  <Code2 className="w-3 h-3 text-blue-500" />
                  Linguagem
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">
                  {data.repository.language || 'TypeScript'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-500" />
                  Visibilidade
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 capitalize block">
                  {data.repository.visibility === 'private' ? 'Privado' : 'Público'} • {data.repository.stargazersCount} ★
                </span>
              </div>
            </div>

            {pushedAtFormatted && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                <span>Último push no GitHub:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {pushedAtFormatted}
                </span>
              </div>
            )}

            {/* Tópicos ou Stack Principal */}
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                {data.repository.topics.length > 0 ? 'Tópicos do GitHub' : 'Tecnologias do Ecossistema'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(data.repository.topics.length > 0 ? data.repository.topics : techStack).map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700/70"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Card 2: Desenvolvedor & Contato */}
          <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-4">
              {!avatarFailed && data.developer.avatarUrl ? (
                <img
                  src={data.developer.avatarUrl}
                  alt={data.developer.name}
                  onError={() => setAvatarFailed(true)}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-cyan-500/40 shadow-md shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-blue-700 text-white font-black text-xl flex items-center justify-center shadow-md shrink-0">
                  EC
                </div>
              )}

              <div className="min-w-0 space-y-0.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400 block">
                  Desenvolvedor & Contato
                </span>
                <h2 className="text-lg font-black text-slate-900 dark:text-white truncate [text-wrap:balance]">
                  {data.developer.name}
                </h2>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {data.developer.role}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 pt-0.5">
                  <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                  <span>{data.developer.location}</span>
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200/70 dark:border-slate-800 [text-wrap:pretty]">
              {data.developer.bio}
            </p>

            {/* Canais de Contato */}
            <div className="space-y-2.5">
              {/* WhatsApp */}
              <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                      WhatsApp Direto
                    </span>
                    <span
                      id={whatsappTargetId}
                      className="text-sm font-black text-slate-900 dark:text-white font-mono"
                    >
                      {data.developer.whatsapp}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <CopyTargetButton
                    targetId={whatsappTargetId}
                    ariaLabel="Copiar número de WhatsApp do desenvolvedor"
                  />
                  <a
                    href={data.developer.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all shadow-sm active:scale-95"
                  >
                    <span>Conversar</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* E-mail */}
              <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-blue-600 text-white shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      E-mail
                    </span>
                    <a
                      id={emailTargetId}
                      href={`mailto:${data.developer.email}`}
                      className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-cyan-400 truncate block"
                    >
                      {data.developer.email}
                    </a>
                  </div>
                </div>
                <CopyTargetButton
                  targetId={emailTargetId}
                  ariaLabel="Copiar e-mail do desenvolvedor"
                />
              </div>

              {/* Links GitHub & Portfólio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <a
                  href={data.developer.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserIcon className="w-4 h-4 text-slate-700 dark:text-slate-300 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        GitHub
                      </span>
                      <span className="text-xs font-black text-slate-800 dark:text-white truncate block">
                        @{data.developer.githubUsername}
                        {data.developer.publicRepos !== null ? ` (${data.developer.publicRepos})` : ''}
                      </span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </a>

                <a
                  href={data.developer.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Globe className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        Portfólio
                      </span>
                      <span className="text-xs font-black text-slate-800 dark:text-white truncate block">
                        ecrz-portifolio
                      </span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </a>
              </div>
            </div>
          </section>
        </div>

        {/* Coluna Direita: Histórico das Últimas 20 Atualizações */}
        <section className="lg:col-span-7 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 border border-cyan-200/70 dark:border-cyan-800/60">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white [text-wrap:balance]">
                  Histórico das Últimas 20 Atualizações
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Exibindo <strong className="text-slate-700 dark:text-slate-200">{filteredCommits.length}</strong> de{' '}
                  <strong className="text-slate-700 dark:text-slate-200">{parsedCommits.length}</strong> atualizações recentes
                </p>
              </div>
            </div>

            <a
              href={`${data.repository.htmlUrl}/commits/${data.repository.defaultBranch || 'main'}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-700 dark:text-cyan-400 hover:underline self-start sm:self-center"
            >
              <span>Ver tudo no GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Barra de Busca e Filtros */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar por módulo, descrição ou hash..."
                aria-label="Filtrar histórico de atualizações"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por tipo de atualização">
              {(
                [
                  { id: 'all', label: 'Todas', count: categoryCounts.all },
                  { id: 'feat', label: 'Novidades', count: categoryCounts.feat },
                  { id: 'fix', label: 'Correções', count: categoryCounts.fix },
                  { id: 'other', label: 'Outros', count: categoryCounts.other },
                ] as const
              ).map((tab) => {
                const active = categoryFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCategoryFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-cyan-600 dark:border-cyan-500 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista de Commits */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 animate-pulse space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
                    <div className="h-5 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
                  </div>
                  <div className="h-4 w-4/5 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
                </div>
              ))}
            </div>
          ) : filteredCommits.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
              <Wrench className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                Nenhuma atualização encontrada para esse filtro.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCategoryFilter('all');
                }}
                className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <ol className="space-y-2.5 max-h-[760px] overflow-y-auto custom-scrollbar pr-1">
              {filteredCommits.map(({ commit, parsed }, index) => {
                const isCurrent = commit.shortHash === localCommitHash;
                const { formatted, relative } = formatCommitDate(commit.date);
                const hashTargetId = `${idPrefix}-commit-${commit.shortHash}-${index}`;

                const typeBadgeClass =
                  parsed.category === 'feat'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/80'
                    : parsed.category === 'fix'
                    ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800/80'
                    : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800/80';

                return (
                  <li
                    key={commit.sha || `${commit.shortHash}-${index}`}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                      isCurrent
                        ? 'bg-cyan-50/70 dark:bg-cyan-950/30 border-cyan-300 dark:border-cyan-700/80 shadow-sm'
                        : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono font-black text-slate-400 dark:text-slate-500">
                          #{index + 1}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${typeBadgeClass}`}>
                          {parsed.badgeLabel}
                        </span>
                        {parsed.scope && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-200/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-200">
                            {parsed.scope}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-cyan-600 text-white">
                            Em Uso
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        {relative && (
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {relative}
                          </span>
                        )}
                        {relative && <span>•</span>}
                        <span className="font-mono">{formatted}</span>
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug [text-wrap:balance]">
                      {parsed.cleanTitle}
                    </h3>

                    {commit.description && (
                      <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed bg-white/70 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800 [text-wrap:pretty]">
                        {commit.description}
                      </p>
                    )}

                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                        <GitCommit className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                        <code
                          id={hashTargetId}
                          data-copy-value={commit.shortHash}
                          className="font-mono font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                        >
                          {commit.shortHash}
                        </code>
                        <CopyTargetButton
                          targetId={hashTargetId}
                          ariaLabel={`Copiar hash ${commit.shortHash}`}
                        />
                        <span className="text-slate-400">•</span>
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {commit.authorName}
                        </span>
                      </div>

                      <a
                        href={commit.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-cyan-700 dark:text-cyan-400 hover:underline"
                      >
                        <span>Ver no GitHub</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
};
