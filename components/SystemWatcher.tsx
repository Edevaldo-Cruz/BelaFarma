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
  Image as ImageIcon
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

export const SystemWatcher: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
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

  useEffect(() => {
    fetchHealth();
    // Atualiza automaticamente a cada 20 segundos
    const interval = setInterval(fetchHealth, 20000);
    return () => clearInterval(interval);
  }, []);

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
        // Espera 3 segundos e recarrega o status para ver as mudanças
        setTimeout(fetchHealth, 3000);
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
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <Activity className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Vigilante de Serviços
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Monitoramento de integridade dos bancos de dados, conexões com WhatsApp e rotinas agendadas.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleTestAlert}
            disabled={isTestingAlert || !health}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 font-bold transition-all text-sm disabled:opacity-50"
          >
            <MessageSquare className={`w-4 h-4 ${isTestingAlert ? 'animate-bounce' : ''}`} />
            Testar Alerta no WA
          </button>
          
          <button 
            onClick={fetchHealth}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/20 font-bold transition-all text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Recarregar Status
          </button>
        </div>
      </div>

      {health && (
        <>
          {/* BANNER DE SAÚDE GERAL */}
          <div className={`p-6 rounded-2xl border flex flex-col md:flex-row items-center gap-4 transition-all duration-300 ${overall.color}`}>
            {overall.icon}
            <div className="text-center md:text-left space-y-1">
              <h2 className="text-xl font-bold">{overall.label}</h2>
              <p className="text-sm opacity-90">{overall.desc}</p>
            </div>
            <div className="md:ml-auto flex items-center gap-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <div>Uptime: <span className="font-bold text-slate-800 dark:text-white">{formatUptime(health.system.uptimeSeconds)}</span></div>
              <div className="w-1.5 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
              <div>Memória: <span className="font-bold text-slate-800 dark:text-white">{health.system.processMemoryMB}MB / {health.system.totalMemoryMB}MB</span></div>
            </div>
          </div>

          {/* GRID DE CONEXÕES / INFRA */}
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-3">Conexões & Bancos de Dados</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              
              {/* SQLite Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
                    <Database className="w-5 h-5" />
                  </span>
                  {health.database.operational ? (
                    <span className="px-2 py-1 text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 rounded-lg">ONLINE</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-black text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400 rounded-lg">OFFLINE</span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-500 dark:text-slate-400">SQLite Local</h3>
                  <p className="text-lg font-black text-slate-800 dark:text-white mt-1">belafarma.db</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Tamanho: {health.database.sizeMB} MB</p>
                </div>
              </div>

              {/* Digifarma Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
                    <Server className="w-5 h-5" />
                  </span>
                  {health.digifarmaDb.operational ? (
                    <span className="px-2 py-1 text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 rounded-lg">ONLINE</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-black text-amber-600 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 rounded-lg">OFFLINE</span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-500 dark:text-slate-400">Banco Digifarma</h3>
                  <p className="text-lg font-black text-slate-800 dark:text-white mt-1">Firebird DB</p>
                  <p className="text-xs text-red-500 mt-1 truncate" title={health.digifarmaDb.error || ''}>
                    {health.digifarmaDb.error ? 'Sem resposta na rede local' : 'Conexão ativa na rede local'}
                  </p>
                </div>
              </div>

              {/* WA Principal Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
                    <MessageSquare className="w-5 h-5" />
                  </span>
                  {health.whatsapp.principal.connected ? (
                    <span className="px-2 py-1 text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 rounded-lg">CONECTADO</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-black text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400 rounded-lg">DESCONECTADO</span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-500 dark:text-slate-400">WhatsApp Principal</h3>
                  <p className="text-lg font-black text-slate-800 dark:text-white mt-1">Baileys Local</p>
                  <p className="text-xs text-slate-400 mt-1">Sessão: {health.whatsapp.principal.status || 'unknown'}</p>
                </div>
              </div>

              {/* WA Secundario Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="p-3 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-xl">
                    <MessageSquare className="w-5 h-5" />
                  </span>
                  {health.whatsapp.secundario.connected ? (
                    <span className="px-2 py-1 text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 rounded-lg">CONECTADO</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-black text-slate-400 bg-slate-100 dark:bg-slate-850 dark:text-slate-400 rounded-lg">INATIVO</span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-500 dark:text-slate-400">WhatsApp Secundário</h3>
                  <p className="text-lg font-black text-slate-800 dark:text-white mt-1">Baileys Local</p>
                  <p className="text-xs text-slate-400 mt-1">Sessão: {health.whatsapp.secundario.status || 'unknown'}</p>
                </div>
              </div>

              {/* Evolution API Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="p-3 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl">
                    <Network className="w-5 h-5" />
                  </span>
                  {health.evolutionApi.operational ? (
                    <span className="px-2 py-1 text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 rounded-lg">ONLINE</span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-black text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400 rounded-lg">OFFLINE</span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-500 dark:text-slate-400">Evolution API</h3>
                  <p className="text-lg font-black text-slate-800 dark:text-white mt-1">Docker API</p>
                  <p className="text-xs text-slate-400 mt-1 truncate" title={health.evolutionApi.error || ''}>
                    {health.evolutionApi.instances.length > 0 
                      ? `${health.evolutionApi.instances.length} instâncias ativas` 
                      : health.evolutionApi.error || 'Nenhuma instância'}
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* HISTÓRICO DE SERVIÇOS EM SEGUNDO PLANO */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Rotinas de Segundo Plano</h2>
              <span className="text-xs text-slate-400 font-medium">Verificando atrasos de crons</span>
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
                      <span className="px-2 py-1 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-lg">NEVER</span>
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
    </div>
  );
};
