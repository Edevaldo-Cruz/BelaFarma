import React, { useState, useEffect } from 'react';
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
  Globe
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
  onDispararRobo: (fornecedor?: 'PROFARMA' | 'DPC' | 'SOTON' | 'DISTRIMED' | 'TODOS') => void;
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
  const [modoContinuo, setModoContinuo] = useState(false);

  // Sincroniza prop inicial
  useEffect(() => {
    if (statusCotacao) {
      setLiveStatus(statusCotacao);
    }
  }, [statusCotacao]);

  // Polling dedicado para manter a janelinha do canto inferior direito sempre viva
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

          // Se o modo contínuo estiver ligado e o lote acabou mas ainda há fila, dispara próximo lote automaticamente
          if (
            modoContinuo &&
            !data.status.emAndamento &&
            (data.status.fila?.aguardandoRobo > 0 || aguardandoRoboCount > 0)
          ) {
            onDispararRobo('TODOS');
          }
        }
      } catch (e) {}
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2500);
    return () => clearInterval(interval);
  }, [modoContinuo, aguardandoRoboCount]);

  const emAndamento = Boolean(liveStatus?.emAndamento || cotandoAoVivo);
  const totalLote = Number(liveStatus?.total) || 0;
  const atualLote = Number(liveStatus?.atual) || 0;
  const encontradosLote = Number(liveStatus?.encontrados) || 0;
  const pct = totalLote > 0 ? Math.min(100, Math.round((atualLote / totalLote) * 100)) : 0;

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
    <div className="fixed bottom-4 right-4 z-[80] w-[360px] sm:w-[410px] rounded-2xl bg-[#09101e]/95 backdrop-blur-md border-2 border-cyan-500/50 shadow-2xl shadow-cyan-950/80 text-slate-100 overflow-hidden transition-all duration-300">
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
                  : aguardandoRoboCount > 0
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-400'
              }`}>
                {emAndamento ? 'TRABALHANDO' : aguardandoRoboCount > 0 ? `${aguardandoRoboCount} NA FILA` : 'CONCLUÍDO'}
              </span>
            </div>
            <p className="text-[10px] text-slate-300 truncate">
              {emAndamento
                ? (liveStatus?.ultimoItem || 'Consultando portais...')
                : aguardandoRoboCount > 0
                  ? `Aguardando Robô: ${aguardandoRoboCount} itens (R$ ${aguardandoRoboValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
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
          {/* Resumo da Fila "AGUARDANDO ROBÔ" e Controles de Disparo */}
          <div className="p-2.5 rounded-xl bg-[#060b14] border border-slate-800 flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase text-cyan-400 block">
                Fila Aguardando Cotação
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
              <button
                type="button"
                onClick={() => {
                  const novoModo = !modoContinuo;
                  setModoContinuo(novoModo);
                  if (novoModo && !emAndamento && aguardandoRoboCount > 0) {
                    onDispararRobo('TODOS');
                  }
                }}
                className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase border transition-all cursor-pointer flex items-center gap-1 ${
                  modoContinuo
                    ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-amber-500/60'
                }`}
                title="Quando ativado, o robô emenda um lote após o outro automaticamente até zerar todos os itens 'Aguardando Robô'"
              >
                <Zap className="w-3 h-3" />
                <span>{modoContinuo ? 'Auto-Fila ON' : 'Auto-Fila'}</span>
              </button>

              <button
                type="button"
                disabled={emAndamento}
                onClick={() => onDispararRobo('TODOS')}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 text-white text-[10px] font-black uppercase shadow-md transition-all cursor-pointer flex items-center gap-1"
              >
                {emAndamento ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>{pct}%</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" />
                    <span>Cotar Lote</span>
                  </>
                )}
              </button>
            </div>
          </div>

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
                    : 'Clique em "Cotar Lote" ou ative "Auto-Fila" para ver o robô pesquisando produto por produto.'}
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
