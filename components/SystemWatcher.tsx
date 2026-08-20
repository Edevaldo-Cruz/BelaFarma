import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  MessageSquare, 
  Database, 
  Server, 
  Play, 
  Clock, 
  Cpu, 
  Network, 
  ShieldCheck, 
  Radio, 
  ClipboardList, 
  Image as ImageIcon,
  History,
  Terminal,
  Trash2,
  Download,
  Search,
  Filter,
  Info,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Power
} from 'lucide-react';
import { useToast } from './ToastContext';

interface ConnectionStatus {
  connected: boolean;
  status?: string;
  operational?: boolean;
  sizeMB?: string;
  error?: string | null;
  instances?: Array<{
    name: string;
    status: string;
    connectionStatus: string;
  }>;
}

interface BackgroundService {
  name: string;
  label: string;
  lastRun: string | null;
  lastSuccess: string | null;
  status: 'SUCCESS' | 'FAILED' | 'RUNNING' | 'NEVER_RUN';
  health: 'OK' | 'FAILED' | 'DELAYED' | 'UNKNOWN';
  lastError: string | null;
  delayMessage: string | null;
}

interface SystemHealth {
  database: ConnectionStatus;
  system: {
    uptimeSeconds: number;
    totalMemoryMB: number;
    freeMemoryMB: number;
    processMemoryMB: number;
    platform: string;
  };
  whatsapp: {
    principal: ConnectionStatus;
    secundario: ConnectionStatus;
  };
  evolutionApi: {
    operational: boolean;
    error: string | null;
    instances: Array<{
      name: string;
      status: string;
      connectionStatus: string;
    }>;
  };
  digifarmaDb: ConnectionStatus;
  backgroundServices: BackgroundService[];
}

interface SystemIncident {
  id: number;
  timestamp: string;
  type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  details: string | null;
  duration_seconds: number | null;
  resolved_at: string | null;
}

export const SystemWatcher: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'health' | 'incidents' | 'logs'>('health');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [incidents, setIncidents] = useState<SystemIncident[]>([]);
  const [expandedIncidentId, setExpandedIncidentId] = useState<number | null>(null);
  const [incidentTypeFilter, setIncidentTypeFilter] = useState<string>('ALL');
  
  // Logs
  const [logLines, setLogLines] = useState<string[]>([]);
  const [totalLogLines, setTotalLogLines] = useState<number>(0);
  const [logSearch, setLogSearch] = useState<string>('');
  const [logLevelFilter, setLogLevelFilter] = useState<'ALL' | 'ERROR' | 'WARN'>('ALL');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isTestingAlert, setIsTestingAlert] = useState(false);
  const [runningServices, setRunningServices] = useState<Record<string, boolean>>({});
  const { addToast } = useToast();

  const fetchHealth = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/system/status');
      if (response.ok) {
        const data = await response.json();
        setHealth(data);
      } else {
        throw new Error('Falha ao obter status do sistema');
      }
    } catch (error) {
      console.error(error);
      addToast('Erro ao carregar dados do Vigilante', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchIncidents = async () => {
    try {
      const url = incidentTypeFilter === 'ALL' 
        ? '/api/system/incidents?limit=60' 
        : `/api/system/incidents?limit=60&type=${encodeURIComponent(incidentTypeFilter)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data);
      }
    } catch (err) {
      console.error('Erro ao buscar incidentes:', err);
    }
  };

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const filterParam = logLevelFilter === 'ALL' ? logSearch : `${logLevelFilter} ${logSearch}`.trim();
      const query = filterParam ? `?lines=200&filter=${encodeURIComponent(filterParam)}` : `?lines=200`;
      const res = await fetch(`/api/system/logs${query}`);
      if (res.ok) {
        const data = await res.json();
        setLogLines(data.lines || []);
        setTotalLogLines(data.totalLines || 0);
      }
    } catch (err) {
      console.error('Erro ao buscar logs:', err);
      addToast('Falha ao buscar logs do servidor', 'error');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchIncidents();
    // Atualiza automaticamente a cada 20 segundos
    const interval = setInterval(() => {
      fetchHealth();
      if (activeTab === 'incidents') fetchIncidents();
    }, 20000);
    return () => clearInterval(interval);
  }, [activeTab, incidentTypeFilter]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab, logLevelFilter]);

  const handleTriggerService = async (serviceName: string) => {
    setRunningServices(prev => ({ ...prev, [serviceName]: true }));
    addToast(`Disparando execução de "${serviceName}"...`, 'info');
    
    try {
      const response = await fetch('/api/system/trigger-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceName })
      });
      
      if (response.ok) {
        addToast(`Serviço "${serviceName}" iniciado com sucesso!`, 'success');
        setTimeout(() => {
          fetchHealth();
          fetchIncidents();
        }, 3000);
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Falha ao disparar serviço');
      }
    } catch (error) {
      console.error(error);
      addToast(error instanceof Error ? error.message : `Erro ao disparar "${serviceName}"`, 'error');
    } finally {
      setRunningServices(prev => ({ ...prev, [serviceName]: false }));
    }
  };

  const handleTestAlert = async () => {
    setIsTestingAlert(true);
    addToast('Disparando teste de alertas...', 'info');
    try {
      const response = await fetch('/api/system/run-watcher-check', { method: 'POST' });
      if (response.ok) {
        addToast('Notificação enviada com sucesso no WhatsApp do admin!', 'success');
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Falha ao enviar alerta de teste');
      }
    } catch (error) {
      console.error(error);
      addToast(error instanceof Error ? error.message : 'Erro ao disparar alertas de teste', 'error');
    } finally {
      setIsTestingAlert(false);
    }
  };

  const handleSimulateIncident = async () => {
    try {
      const res = await fetch('/api/system/incidents/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'SERVICE_FAILURE',
          severity: 'WARNING',
          title: 'Teste de Diagnóstico Manual',
          details: 'Este incidente foi gerado para verificar a caixa-preta e o sistema de telemetria.'
        })
      });
      if (res.ok) {
        addToast('Incidente de teste registrado com sucesso!', 'success');
        fetchIncidents();
      }
    } catch (err) {
      addToast('Erro ao criar incidente de teste', 'error');
    }
  };

  const handleClearIncidents = async () => {
    if (!confirm('Deseja realmente limpar todo o histórico de incidentes?')) return;
    try {
      const res = await fetch('/api/system/incidents/clear', { method: 'DELETE' });
      if (res.ok) {
        addToast('Histórico de incidentes limpo com sucesso!', 'success');
        setIncidents([]);
      }
    } catch (err) {
      addToast('Erro ao limpar incidentes', 'error');
    }
  };

  const handleDownloadLogs = () => {
    const blob = new Blob([logLines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `belafarma-backend-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  };

  const formatDate = (isoString: string | null) => {
    if (!isoString) return 'Nunca';
    const date = new Date(isoString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds || seconds <= 0) return 'Indeterminado';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  };

  const getServiceIcon = (name: string) => {
    switch (name) {
      case 'backup':
        return <ShieldCheck className="w-5 h-5" />;
      case 'robo_ofertas_jit':
        return <ImageIcon className="w-5 h-5" />;
      case 'robo_status':
        return <ImageIcon className="w-5 h-5" />;
      case 'auto_shortages':
        return <ClipboardList className="w-5 h-5" />;
      case 'radio_news':
        return <Radio className="w-5 h-5" />;
      case 'whatsapp_vendas_sync':
        return <RefreshCw className="w-5 h-5" />;
      default:
        return <Activity className="w-5 h-5" />;
    }
  };

  const getIncidentBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 rounded-lg inline-flex items-center gap-1"><XCircle className="w-3 h-3" /> Crítico</span>;
      case 'WARNING':
        return <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 rounded-lg inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Aviso</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 rounded-lg inline-flex items-center gap-1"><Info className="w-3 h-3" /> Info</span>;
    }
  };

  const getIncidentTypeLabel = (type: string) => {
    switch (type) {
      case 'SERVER_RESTART': return 'Queda / Reinício Servidor';
      case 'WHATSAPP_DISCONNECT': return 'Queda WhatsApp (Baileys)';
      case 'UNCAUGHT_ERROR': return 'Exceção / Erro Fatal';
      case 'SERVICE_FAILURE': return 'Falha em Serviço/Cron';
      case 'HIGH_MEMORY': return 'Alerta de Memória (OOM)';
      default: return type;
    }
  };

  // Avalia se o sistema possui algum alerta pendente
  const getOverallHealth = () => {
    if (!health) return { status: 'UNKNOWN', label: 'Carregando...', color: 'text-slate-500 bg-slate-100 dark:bg-slate-800' };
    
    let hasCriticalError = false;
    let hasWarning = false;

    // Conexões críticas
    if (!health.database.operational || !health.whatsapp.principal.connected) {
      hasCriticalError = true;
    }

    // Serviços em background
    health.backgroundServices.forEach(s => {
      if (s.health === 'FAILED') hasCriticalError = true;
      if (s.health === 'DELAYED') hasWarning = true;
    });

    if (!health.evolutionApi.operational || !health.digifarmaDb.operational) {
      hasWarning = true;
    }

    if (hasCriticalError) {
      return { 
        status: 'CRITICAL', 
        label: 'Atenção Requerida', 
        desc: 'Identificamos falhas críticas que afetam o funcionamento do sistema.',
        color: 'border-red-500/20 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400',
        icon: <XCircle className="w-12 h-12 text-red-500" />
      };
    }

    if (hasWarning) {
      return { 
        status: 'WARNING', 
        label: 'Alertas Pendentes', 
        desc: 'Serviços secundários offline ou crons programados estão atrasados.',
        color: 'border-amber-500/20 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400',
        icon: <AlertTriangle className="w-12 h-12 text-amber-500" />
      };
    }

    return { 
      status: 'OK', 
      label: 'Sistema Saudável', 
      desc: 'Todas as conexões estão online e os crons rodaram no prazo.',
      color: 'border-emerald-500/20 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400',
      icon: <CheckCircle2 className="w-12 h-12 text-emerald-500" />
    };
  };

  const overall = getOverallHealth();

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
            <Activity className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Vigilante do Sistema
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Monitoramento de saúde, diagnóstico forense de interrupções e logs da Belinha.
          </p>
        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl">
          <button
            onClick={() => setActiveTab('health')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'health'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            Saúde & Conexões
          </button>
          
          <button
            onClick={() => { setActiveTab('incidents'); fetchIncidents(); }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all relative ${
              activeTab === 'incidents'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            Histórico de Quedas
            {incidents.filter(i => i.severity === 'CRITICAL').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => { setActiveTab('logs'); fetchLogs(); }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'logs'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Logs do Servidor
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 1: SAÚDE EM TEMPO REAL                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'health' && (
        <>
          {/* BANNER PRINCIPAL DE STATUS */}
          <div className={`p-6 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm ${overall.color}`}>
            <div className="flex items-center gap-5">
              {overall.icon}
              <div>
                <span className="text-xs font-black uppercase tracking-wider opacity-75">Status Geral do Ecossistema</span>
                <h2 className="text-2xl font-black">{overall.label}</h2>
                <p className="text-sm mt-0.5 opacity-90">{overall.desc}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleTestAlert}
                disabled={isTestingAlert}
                className="px-4 py-2.5 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl shadow-sm border border-slate-200/50 dark:border-slate-700/50 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isTestingAlert ? <RefreshCw className="w-4 h-4 animate-spin text-amber-500" /> : <MessageSquare className="w-4 h-4 text-emerald-500" />}
                <span>Testar Notificação WhatsApp</span>
              </button>

              <button
                onClick={fetchHealth}
                disabled={isLoading}
                className="p-2.5 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl shadow-sm border border-slate-200/50 dark:border-slate-700/50 transition-all disabled:opacity-50"
                title="Atualizar Status"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-500' : ''}`} />
              </button>
            </div>
          </div>

          {health && (
            <>
              {/* CARDS DE CONEXÕES EM TEMPO REAL */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* BANCO DE DADOS LOCAL */}
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="p-2.5 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-xl">
                      <Database className="w-5 h-5" />
                    </span>
                    {health.database.operational ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Operacional
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2.5 py-1 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        Inoperante
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">Banco SQLite Local</h3>
                    <p className="text-xs text-slate-400">Tamanho: <strong className="text-slate-600 dark:text-slate-300">{health.database.sizeMB} MB</strong></p>
                  </div>
                </div>

                {/* WHATSAPP PRINCIPAL (BAILEYS) */}
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="p-2.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
                      <MessageSquare className="w-5 h-5" />
                    </span>
                    {health.whatsapp.principal.connected ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Conectado
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2.5 py-1 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        Desconectado
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">WhatsApp Principal</h3>
                    <p className="text-xs text-slate-400">Status: <strong className="text-slate-600 dark:text-slate-300">{health.whatsapp.principal.status}</strong></p>
                  </div>
                </div>

                {/* EVOLUTION API */}
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="p-2.5 bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 rounded-xl">
                      <Network className="w-5 h-5" />
                    </span>
                    {health.evolutionApi.operational ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Online
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        Offline
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">Evolution API</h3>
                    <p className="text-xs text-slate-400">Instâncias ativas: <strong className="text-slate-600 dark:text-slate-300">{health.evolutionApi.instances?.length || 0}</strong></p>
                  </div>
                </div>

                {/* DIGIFARMA / FIREBIRD */}
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="p-2.5 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-xl">
                      <Server className="w-5 h-5" />
                    </span>
                    {health.digifarmaDb.operational ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Sincronizado
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                        Indisponível
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">Digifarma (Firebird)</h3>
                    <p className="text-xs text-slate-400">Rede Local: <strong className="text-slate-600 dark:text-slate-300">{health.digifarmaDb.operational ? 'OK' : 'Falha/Timeout'}</strong></p>
                  </div>
                </div>
              </div>

              {/* RECURSOS DA MÁQUINA (RASPBERRY PI) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <h2 className="text-base font-bold text-slate-800 dark:text-white">Recursos do Servidor (Raspberry Pi)</h2>
                  </div>
                  <span className="text-xs font-semibold text-slate-400">Plataforma: {health.system.platform}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-slate-400" /> Uptime Contínuo
                    </span>
                    <div className="text-xl font-black text-slate-800 dark:text-white">
                      {formatUptime(health.system.uptimeSeconds)}
                    </div>
                    <p className="text-[11px] text-slate-400">Tempo desde a última inicialização do Node</p>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-slate-400" /> Memória do Processo (Belinha)
                    </span>
                    <div className="text-xl font-black text-slate-800 dark:text-white">
                      {health.system.processMemoryMB} MB
                    </div>
                    <p className="text-[11px] text-slate-400">Consumo RSS isolado do container</p>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                      <Server className="w-4 h-4 text-slate-400" /> Memória RAM do Host
                    </span>
                    <div className="text-xl font-black text-slate-800 dark:text-white">
                      {health.system.freeMemoryMB} MB livres <span className="text-xs text-slate-400 font-normal">de {health.system.totalMemoryMB} MB</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-1">
                      <div 
                        className="bg-indigo-600 h-full rounded-full" 
                        style={{ width: `${Math.round(((health.system.totalMemoryMB - health.system.freeMemoryMB) / health.system.totalMemoryMB) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* HISTÓRICO DE SERVIÇOS EM SEGUNDO PLANO */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white">Rotinas de Segundo Plano</h2>
                  <span className="text-xs text-slate-400 font-medium">Verificando atrasos de crons e automações</span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                        <th className="p-4 pl-6">Serviço / Rotina</th>
                        <th className="p-4">Último Início</th>
                        <th className="p-4">Último Sucesso</th>
                        <th className="p-4">Estado de Saúde</th>
                        <th className="p-4 text-center pr-6">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {health.backgroundServices.map((srv) => {
                        const isRunning = runningServices[srv.name] || srv.status === 'RUNNING';
                        
                        let statusBadge = (
                          <span className="px-2 py-1 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-lg">NUNCA</span>
                        );
                        if (srv.health === 'OK') {
                          statusBadge = (
                            <span className="px-2.5 py-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 rounded-lg inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> OK
                            </span>
                          );
                        } else if (srv.health === 'FAILED') {
                          statusBadge = (
                            <span className="px-2.5 py-1 text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400 rounded-lg inline-flex items-center gap-1" title={srv.lastError || ''}>
                              <XCircle className="w-3.5 h-3.5" /> FALHOU
                            </span>
                          );
                        } else if (srv.health === 'DELAYED') {
                          statusBadge = (
                            <span className="px-2.5 py-1 text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 rounded-lg inline-flex items-center gap-1" title={srv.delayMessage || ''}>
                              <AlertTriangle className="w-3.5 h-3.5" /> ATRASADO
                            </span>
                          );
                        }

                        if (srv.status === 'RUNNING') {
                          statusBadge = (
                            <span className="px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/20 dark:text-blue-400 rounded-lg inline-flex items-center gap-1 animate-pulse">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> RODANDO...
                            </span>
                          );
                        }

                        return (
                          <tr key={srv.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                            <td className="p-4 pl-6 flex items-center gap-3">
                              <span className={`p-2.5 rounded-xl ${
                                srv.health === 'OK' 
                                  ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400' 
                                  : srv.health === 'FAILED'
                                    ? 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400'
                                    : srv.health === 'DELAYED'
                                      ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                              }`}>
                                {getServiceIcon(srv.name)}
                              </span>
                              <div>
                                <span className="font-bold text-sm text-slate-800 dark:text-white block">{srv.label}</span>
                                <span className="text-xs text-slate-400 dark:text-slate-500 block truncate max-w-xs">{srv.name}</span>
                              </div>
                            </td>
                            <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                              {formatDate(srv.lastRun)}
                            </td>
                            <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                              {formatDate(srv.lastSuccess)}
                            </td>
                            <td className="p-4">
                              <div className="space-y-1">
                                {statusBadge}
                                {srv.delayMessage && srv.health === 'DELAYED' && (
                                  <span className="text-[10px] text-amber-500 font-medium block">{srv.delayMessage}</span>
                                )}
                                {srv.lastError && srv.health === 'FAILED' && (
                                  <span className="text-[10px] text-red-500 font-medium block truncate max-w-xs" title={srv.lastError}>
                                    {srv.lastError}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-center pr-6">
                              <button
                                onClick={() => handleTriggerService(srv.name)}
                                disabled={isRunning}
                                className="p-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl transition-all disabled:opacity-40 inline-flex items-center gap-1 font-bold text-xs"
                                title="Executar serviço agora"
                              >
                                {isRunning ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span className="hidden sm:inline">Executar</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 2: HISTÓRICO DE INCIDENTES & QUEDAS                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <History className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h2 className="text-base font-bold text-slate-800 dark:text-white">Caixa-Preta de Interrupções & Quedas</h2>
                <p className="text-xs text-slate-500">Histórico cronológico de reinicializações, desconexões e erros não tratados</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={incidentTypeFilter}
                onChange={(e) => setIncidentTypeFilter(e.target.value)}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 outline-none"
              >
                <option value="ALL">🔍 Todos os Tipos</option>
                <option value="SERVER_RESTART">🔌 Queda/Reinício Servidor</option>
                <option value="WHATSAPP_DISCONNECT">💬 Queda WhatsApp</option>
                <option value="UNCAUGHT_ERROR">💥 Erros Fatais</option>
                <option value="SERVICE_FAILURE">⚙️ Falha de Serviços</option>
              </select>

              <button
                onClick={handleSimulateIncident}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition-all"
                title="Criar incidente para testar auditoria"
              >
                Simular Teste
              </button>

              <button
                onClick={fetchIncidents}
                className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all"
                title="Recarregar"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {incidents.length > 0 && (
                <button
                  onClick={handleClearIncidents}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all"
                  title="Limpar Histórico"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {incidents.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="text-base font-bold text-slate-800 dark:text-white">Nenhuma interrupção registrada</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                O sistema não registrou quedas não programadas, desconexões críticas ou exceções fatais recentemente.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                      <th className="p-4 pl-6">Data / Horário</th>
                      <th className="p-4">Gravidade</th>
                      <th className="p-4">Tipo</th>
                      <th className="p-4">Descrição do Incidente</th>
                      <th className="p-4">Tempo Offline</th>
                      <th className="p-4 text-center pr-6">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {incidents.map((inc) => {
                      const isExpanded = expandedIncidentId === inc.id;
                      return (
                        <React.Fragment key={inc.id}>
                          <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all cursor-pointer" onClick={() => setExpandedIncidentId(isExpanded ? null : inc.id)}>
                            <td className="p-4 pl-6 text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {formatDate(inc.timestamp)}
                            </td>
                            <td className="p-4">
                              {getIncidentBadge(inc.severity)}
                            </td>
                            <td className="p-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
                              {getIncidentTypeLabel(inc.type)}
                            </td>
                            <td className="p-4 text-sm font-bold text-slate-800 dark:text-white">
                              {inc.title}
                            </td>
                            <td className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {inc.duration_seconds ? formatDuration(inc.duration_seconds) : (inc.resolved_at ? 'Resolvido' : 'Em andamento')}
                            </td>
                            <td className="p-4 text-center pr-6">
                              <button className="text-slate-400 hover:text-slate-600 p-1">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-slate-50/80 dark:bg-slate-800/50">
                              <td colSpan={6} className="p-4 pl-8 pr-8 space-y-2">
                                <div className="text-xs font-bold text-slate-500 uppercase">Diagnóstico e Detalhes Forenses:</div>
                                <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                                  {inc.details || 'Nenhum detalhe adicional gravado para este evento.'}
                                </pre>
                                {inc.resolved_at && (
                                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                                    ✅ Restabelecido em: {formatDate(inc.resolved_at)}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 3: VISUALIZADOR DE LOGS DO SERVIDOR (backend.log)                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Terminal className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h2 className="text-base font-bold text-slate-800 dark:text-white">Visualizador de Logs em Tempo Real</h2>
                <p className="text-xs text-slate-500">Últimas 200 linhas de <code>backend.log</code> gravadas na Raspberry Pi</p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
              {/* FILTRO DE NÍVEL */}
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setLogLevelFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${logLevelFilter === 'ALL' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setLogLevelFilter('ERROR')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${logLevelFilter === 'ERROR' ? 'bg-red-500 text-white shadow-sm' : 'text-red-500 hover:text-red-600'}`}
                >
                  Erros (❌)
                </button>
                <button
                  onClick={() => setLogLevelFilter('WARN')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${logLevelFilter === 'WARN' ? 'bg-amber-500 text-white shadow-sm' : 'text-amber-500 hover:text-amber-600'}`}
                >
                  Avisos (⚠️)
                </button>
              </div>

              {/* BUSCA DE TEXTO */}
              <div className="relative flex-1 md:w-48">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrar texto..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
                  className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-xs text-slate-800 dark:text-white placeholder-slate-400 outline-none"
                />
              </div>

              <button
                onClick={fetchLogs}
                disabled={isLoadingLogs}
                className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all disabled:opacity-50"
                title="Recarregar logs"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingLogs ? 'animate-spin text-indigo-500' : ''}`} />
              </button>

              <button
                onClick={handleDownloadLogs}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 text-xs font-bold rounded-xl transition-all"
                title="Baixar arquivo de log completo"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Baixar Log</span>
              </button>
            </div>
          </div>

          {/* TERMINAL ESCURO DE LOGS */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs text-slate-300 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
                <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                <span className="ml-2 font-bold text-slate-200">Terminal de Logs da Belinha (backend.log)</span>
              </div>
              <span>{logLines.length} linhas exibidas</span>
            </div>

            <div className="max-h-[500px] overflow-y-auto space-y-1 custom-scrollbar pr-2 select-text">
              {isLoadingLogs ? (
                <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  <span>Carregando fluxo de logs...</span>
                </div>
              ) : logLines.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  Nenhuma linha encontrada para os filtros selecionados.
                </div>
              ) : (
                logLines.map((line, idx) => {
                  const isError = line.includes('❌') || line.includes('ERROR') || line.includes('Error:');
                  const isWarning = line.includes('⚠️') || line.includes('WARN');
                  const isSuccess = line.includes('✅') || line.includes('SUCCESS');
                  const isInfo = line.includes('🤖') || line.includes('🚀') || line.includes('📨');

                  return (
                    <div 
                      key={idx} 
                      className={`py-0.5 leading-relaxed break-all ${
                        isError ? 'text-red-400 bg-red-950/20 px-1 rounded' :
                        isWarning ? 'text-amber-400 bg-amber-950/20 px-1 rounded' :
                        isSuccess ? 'text-emerald-400' :
                        isInfo ? 'text-indigo-300' :
                        'text-slate-300'
                      }`}
                    >
                      {line}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
