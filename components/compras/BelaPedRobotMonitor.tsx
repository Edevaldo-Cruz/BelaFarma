import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Zap,
  Globe,
  Gauge,
  FastForward,
  Pause,
  Layers
} from 'lucide-react';

interface WorkerStatus {
  status: string;
  itemAtual: string;
  avaliados: number;
  encontrados: number;
  semEstoque: number;
}

interface LogEntry {
  hora?: string;
  fornecedor: string;
  ean?: string;
  descricao?: string;
  status?: string;
  preco?: number;
  motivo?: string;
  erro?: string;
}

interface RobotLiveMonitorProps {
  aguardandoRoboCount: number;
  aguardandoRoboValor: number;
  cotandoAoVivo: boolean;
  statusCotacao: any;
  onDispararRobo: (fornecedor?: 'PROFARMA' | 'DPC' | 'SOTON' | 'DISTRIMED' | 'TODOS', tamanhoLote?: number) => void;
  onDadosAtualizados?: () => void;
}

export const BelaPedRobotMonitor: React.FC<RobotLiveMonitorProps> = ({
  aguardandoRoboCount,
  aguardandoRoboValor,
  cotandoAoVivo,
  statusCotacao,
  onDispararRobo,
  onDadosAtualizados
}) => {
  const [minimizado, setMinimizado] = useState(false);
  const [liveStatus, setLiveStatus] = useState<any>(statusCotacao);

  // Modo contínuo ativado por padrão com persistência local
  const [modoContinuo, setModoContinuo] = useState<boolean>(() => {
    try {
      const salvo = localStorage.getItem('belaped_modo_continuo');
      return salvo !== null ? salvo === 'true' : true; // Padrão: Ativado (Auto-Fila ligada)
    } catch {
      return true;
    }
  });

  // Tamanho do lote (40, 80 Turbo ou 120 Ultra)
  const [tamanhoLote, setTamanhoLote] = useState<number>(() => {
    try {
      const salvo = localStorage.getItem('belaped_tamanho_lote');
      return salvo ? Number(salvo) : 80; // Padrão: 80 itens (Modo Turbo para acelerar cotações grandes)
    } catch {
      return 80;
    }
  });

  // Contador regressivo para o próximo lote
  const [countdownProximoLote, setCountdownProximoLote] = useState<number | null>(null);
  const disparandoRef = useRef(false);

  // Salva preferências no localStorage
  const handleToggleModoContinuo = () => {
    const novoValor = !modoContinuo;
    setModoContinuo(novoValor);
    try {
      localStorage.setItem('belaped_modo_continuo', String(novoValor));
    } catch {}
    if (!novoValor) {
      setCountdownProximoLote(null);
    }
  };

  const handleMudarTamanhoLote = (novoTamanho: number) => {
    setTamanhoLote(novoTamanho);
    try {
      localStorage.setItem('belaped_tamanho_lote', String(novoTamanho));
    } catch {}
  };

  // Sincroniza prop inicial
  useEffect(() => {
    if (statusCotacao) {
      setLiveStatus(statusCotacao);
    }
  }, [statusCotacao]);

  // Polling dedicado para manter o mini-monitor sempre atualizado
  useEffect(() => {
    let ultimoEncontrados = 0;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/belaped/status-cotacao');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.status) {
          setLiveStatus(data.status);

          if (data.status.encontrados > ultimoEncontrados) {
            ultimoEncontrados = data.status.encontrados;
            if (onDadosAtualizados) onDadosAtualizados();
          }

          const emAndamentoBackend = Boolean(data.status.emAndamento);
          const totalNaFila = Number(data.status.fila?.aguardandoRobo ?? aguardandoRoboCount);

          // Se o modo contínuo estiver ativo, o robô terminou o lote e ainda restam itens na fila
          if (modoContinuo && !emAndamentoBackend && !disparandoRef.current && totalNaFila > 0) {
            if (countdownProximoLote === null) {
              setCountdownProximoLote(3); // Inicia contagem regressiva de 3s para o próximo lote
            }
          } else if (emAndamentoBackend || totalNaFila === 0) {
            setCountdownProximoLote(null);
          }
        }
      } catch (e) {}
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2500);
    return () => clearInterval(interval);
  }, [modoContinuo, aguardandoRoboCount, countdownProximoLote]);

  // Efeito do contador regressivo para disparo contínuo automático
  useEffect(() => {
    if (countdownProximoLote === null) return;

    if (countdownProximoLote > 0) {
      const timer = setTimeout(() => {
        setCountdownProximoLote(prev => (prev !== null ? prev - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (countdownProximoLote === 0 && !disparandoRef.current) {
      disparandoRef.current = true;
      setCountdownProximoLote(null);
      onDispararRobo('TODOS', tamanhoLote);
      setTimeout(() => {
        disparandoRef.current = false;
      }, 5000);
    }
  }, [countdownProximoLote, onDispararRobo, tamanhoLote]);

  const emAndamento = Boolean(liveStatus?.emAndamento || cotandoAoVivo);
  const totalLote = Number(liveStatus?.total) || 0;
  const atualLote = Number(liveStatus?.atual) || 0;
  const encontradosLote = Number(liveStatus?.encontrados) || 0;
  const pct = totalLote > 0 ? Math.min(100, Math.round((atualLote / totalLote) * 100)) : 0;

  const lotesEstimadosRestantes = Math.ceil(aguardandoRoboCount / Math.max(1, tamanhoLote));

  const workers: Record<string, WorkerStatus> = liveStatus?.workers || {
    'PROFARMA': { status: emAndamento ? 'COTANDO' : 'PRONTO', itemAtual: 'Aguardando disparo', avaliados: 0, encontrados: 0, semEstoque: 0 },
    'DPC DISTRIBUIDORA': { status: emAndamento ? 'COTANDO' : 'PRONTO', itemAtual: 'Aguardando disparo', avaliados: 0, encontrados: 0, semEstoque: 0 },
    'SOTON FARMA': { status: emAndamento ? 'COTANDO' : 'PRONTO', itemAtual: 'Aguardando disparo', avaliados: 0, encontrados: 0, semEstoque: 0 },
    'DISTRIMED': { status: emAndamento ? 'COTANDO' : 'PRONTO', itemAtual: 'Aguardando disparo', avaliados: 0, encontrados: 0, semEstoque: 0 }
  };

  const logsRecentes: LogEntry[] = Array.isArray(liveStatus?.log)
    ? [...liveStatus.log].slice(-12).reverse()
    : [];

  return (
    <div className="fixed bottom-4 right-4 z-[80] w-[370px] sm:w-[425px] rounded-2xl bg-[#09101e]/95 backdrop-blur-md border-2 border-cyan-500/50 shadow-2xl shadow-cyan-950/80 text-slate-100 overflow-hidden transition-all duration-300">
      {/* Barra de Título do Mini-Monitor */}
      <div
        onClick={() => setMinimizado(!minimizado)}
        className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer select-none border-b ${
          emAndamento
            ? 'bg-gradient-to-r from-emerald-950 via-teal-950 to-cyan-950 border-emerald-500/40'
            : aguardandoRoboCount > 0
              ? 'bg-gradient-to-r from-cyan-950 via-slate-900 to-blue-950 border-cyan-700/50'
              : 'bg-[#0d172a] border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-1.5 rounded-xl border ${
            emAndamento
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
              : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
          }`}>
            <Bot className={`w-4 h-4 ${emAndamento ? 'animate-bounce' : ''}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-white truncate">
                Monitor do Robô BelaPed
              </span>
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                emAndamento
                  ? 'bg-emerald-500 text-slate-950 animate-pulse'
                  : countdownProximoLote !== null
                    ? 'bg-amber-400 text-slate-950 animate-pulse font-bold'
                    : aguardandoRoboCount > 0
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-800 text-slate-400'
              }`}>
                {emAndamento
                  ? 'TRABALHANDO'
                  : countdownProximoLote !== null
                    ? `PRÓXIMO EM ${countdownProximoLote}S`
                    : aguardandoRoboCount > 0
                      ? `${aguardandoRoboCount} NA FILA`
                      : 'CONCLUÍDO'}
              </span>
            </div>
            <p className="text-[10px] text-slate-300 truncate">
              {emAndamento
                ? (liveStatus?.ultimoItem || 'Consultando portais...')
                : countdownProximoLote !== null
                  ? `Lote concluído! Disparando próximo lote (${tamanhoLote} itens)...`
                  : aguardandoRoboCount > 0
                    ? `Fila: ${aguardandoRoboCount} itens (R$ ${aguardandoRoboValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
                    : 'Todos os produtos em falta já foram cotados'}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="p-1 rounded-lg hover:bg-white/10 text-slate-300 transition-colors shrink-0"
          title={minimizado ? 'Expandir tela do robô' : 'Minimizar tela do robô'}
        >
          {minimizado ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Corpo Expandido da Tela do Robô */}
      {!minimizado && (
        <div className="p-3.5 space-y-3 text-xs">
          {/* Seletor de Desempenho e Velocidade (Tamanho do Lote) */}
          <div className="p-2.5 rounded-xl bg-[#060b14] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-cyan-400 flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5" />
                Desempenho & Tamanho do Lote
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {aguardandoRoboCount > 0 ? `~${lotesEstimadosRestantes} ciclo(s) restantes` : 'Fila zerada'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                { qtd: 40, label: '40 Itens', sub: 'Padrão' },
                { qtd: 80, label: '80 Itens', sub: 'Turbo ⚡' },
                { qtd: 120, label: '120 Itens', sub: 'Ultra 🚀' }
              ].map(opt => (
                <button
                  key={opt.qtd}
                  type="button"
                  onClick={() => handleMudarTamanhoLote(opt.qtd)}
                  className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                    tamanhoLote === opt.qtd
                      ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 shadow-sm shadow-cyan-900/50'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="text-[10px] font-black">{opt.label}</div>
                  <div className="text-[9px] text-slate-400 leading-tight">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Resumo da Fila e Controles de Ação do Robô */}
          <div className="p-2.5 rounded-xl bg-[#060b14] border border-slate-800 flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Status da Fila
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-sm font-black text-white">
                  {aguardandoRoboCount} produtos
                </span>
                <span className="text-[11px] font-bold text-amber-400">
                  (R$ {aguardandoRoboValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Toggle Auto-Fila Contínua */}
              <button
                type="button"
                onClick={handleToggleModoContinuo}
                className={`px-2.5 py-2 rounded-xl text-[10px] font-black uppercase border transition-all cursor-pointer flex items-center gap-1.5 shadow-sm ${
                  modoContinuo
                    ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-amber-900/30 font-black'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500'
                }`}
                title="Quando ativado, o robô emenda automaticamente um lote após o outro sem parar até zerar toda a fila!"
              >
                <Zap className={`w-3.5 h-3.5 ${modoContinuo ? 'fill-current' : ''}`} />
                <span>{modoContinuo ? 'Auto-Fila ON' : 'Auto-Fila OFF'}</span>
              </button>

              {/* Botão de Disparo / Continuação */}
              <button
                type="button"
                disabled={emAndamento}
                onClick={() => {
                  setCountdownProximoLote(null);
                  onDispararRobo('TODOS', tamanhoLote);
                }}
                className={`px-3 py-2 rounded-xl text-white text-[10px] font-black uppercase shadow-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  emAndamento
                    ? 'bg-slate-800 text-cyan-300 border border-cyan-500/30'
                    : countdownProximoLote !== null
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black animate-pulse'
                      : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 hover:shadow-cyan-900/50'
                }`}
              >
                {emAndamento ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    <span>{pct}% ({atualLote}/{totalLote})</span>
                  </>
                ) : countdownProximoLote !== null ? (
                  <>
                    <FastForward className="w-3.5 h-3.5" />
                    <span>Em {countdownProximoLote}s...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Cotar Lote ({tamanhoLote})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Banner de Próximo Lote Automático (quando finalizado mas com fila) */}
          {countdownProximoLote !== null && !emAndamento && (
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2">
                <FastForward className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>
                  Lote concluído! Iniciando próximo ciclo em <b>{countdownProximoLote}s</b>...
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCountdownProximoLote(null)}
                className="text-[10px] uppercase font-bold text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-black/40"
              >
                Pausar
              </button>
            </div>
          )}

          {/* Barra de Progresso do Lote Atual */}
          {(emAndamento || totalLote > 0) && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="text-slate-300">
                  Lote atual: <b className="text-white">{atualLote}/{totalLote}</b> EANs
                </span>
                <span className="text-emerald-400 font-black">
                  {encontradosLote} preços encontrados ({pct}%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-300"
                  style={{ width: `${Math.max(emAndamento ? 6 : 0, pct)}%` }}
                />
              </div>
            </div>
          )}

          {/* Grid Ao Vivo dos 4 Navegadores / Robôs */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Globe className="w-3 h-3 text-cyan-400" />
              Atividade em Tempo Real nos 4 Portais
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {(['PROFARMA', 'DPC DISTRIBUIDORA', 'SOTON FARMA', 'DISTRIMED'] as const).map((portal) => {
                const w = workers[portal] || { status: 'PRONTO', itemAtual: '-', avaliados: 0, encontrados: 0, semEstoque: 0 };
                const isWorking = w.status === 'COTANDO' || w.status === 'AUTENTICANDO' || w.status === 'INICIANDO';
                const isErr = w.status === 'ERRO';
                return (
                  <div
                    key={portal}
                    className={`p-2 rounded-xl border text-[10px] flex flex-col justify-between ${
                      isWorking
                        ? 'bg-emerald-950/25 border-emerald-500/40'
                        : isErr
                          ? 'bg-rose-950/30 border-rose-500/40'
                          : 'bg-[#060b14] border-slate-800/90'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-black text-white truncate">{portal.replace(' DISTRIBUIDORA', '')}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${
                        isWorking
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : isErr
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-slate-800 text-slate-400'
                      }`}>
                        {w.status}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-300 truncate my-1" title={w.itemAtual}>
                      {w.itemAtual || 'Aguardando...'}
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-bold border-t border-slate-800/80 pt-1">
                      <span className="text-emerald-400">✓ {w.encontrados} c/ preço</span>
                      <span className="text-slate-500">⚪ {w.semEstoque} s/ est.</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Terminal de Logs ao Vivo do Robô */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1">
                <Terminal className="w-3 h-3 text-emerald-400" />
                Console do Robô (Últimas Ações)
              </span>
              {liveStatus?.ultimoItem && (
                <span className="text-[9px] font-mono text-cyan-400 truncate max-w-[170px]">
                  {liveStatus.ultimoItem}
                </span>
              )}
            </div>

            <div className="h-28 overflow-y-auto rounded-xl bg-[#050811] border border-slate-800/90 p-2 font-mono text-[10px] space-y-1 custom-scrollbar">
              {logsRecentes.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-center px-2">
                  {emAndamento
                    ? 'Iniciando instâncias Headless Chrome e autenticando nos portais...'
                    : 'Auto-Fila ativada: o robô executa os lotes em sequência contínua até zerar a lista de produtos.'}
                </div>
              ) : (
                logsRecentes.map((log, index) => (
                  <div key={index} className="flex items-start gap-1.5 leading-tight border-b border-slate-900/80 pb-1">
                    <span className="text-slate-500 shrink-0">{log.hora || '•'}</span>
                    <span className="text-cyan-400 font-bold shrink-0">
                      [{String(log.fornecedor || '').split(' ')[0]}]
                    </span>
                    {log.status === 'OK' ? (
                      <span className="text-emerald-300 truncate">
                        {log.descricao || log.ean} → <b>R$ {Number(log.preco || 0).toFixed(2)}</b>
                      </span>
                    ) : log.status === 'ERRO' ? (
                      <span className="text-rose-400 truncate">
                        Falha: {log.erro}
                      </span>
                    ) : (
                      <span className="text-slate-400 truncate">
                        {log.descricao || log.ean}: Sem estoque
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
