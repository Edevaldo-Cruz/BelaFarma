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
  Layers,
  Flame,
  ShieldAlert,
  Briefcase,
  Clock,
  Square,
  RotateCcw
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
  onDispararRobo: (
    fornecedor?: 'PROFARMA' | 'DPC' | 'SOTON' | 'DISTRIMED' | 'DIVIMED' | 'MARTINS' | 'ORIENTE' | 'TODOS',
    tamanhoLote?: number,
    prioridade?: 'P1' | 'P2' | 'P3' | 'TODAS_PRIORITARIAS'
  ) => void;
  onDadosAtualizados?: () => void;
  modoDiscreto?: boolean;
}

export const BelaPedRobotMonitor: React.FC<RobotLiveMonitorProps> = ({
  aguardandoRoboCount,
  aguardandoRoboValor,
  cotandoAoVivo,
  statusCotacao,
  onDispararRobo,
  onDadosAtualizados,
  modoDiscreto = false
}) => {
  const [minimizado, setMinimizado] = useState(true);
  const [liveStatus, setLiveStatus] = useState<any>(statusCotacao);
  const [parando, setParando] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);

  // Modo contínuo desativado por padrão (evita loops infinitos ou cotações indesejadas)
  const [modoContinuo, setModoContinuo] = useState<boolean>(() => {
    try {
      const salvo = localStorage.getItem('belaped_modo_continuo');
      return salvo === 'true'; // Padrão seguro: false
    } catch {
      return false;
    }
  });
  const [sessaoUsuarioAtiva, setSessaoUsuarioAtiva] = useState<boolean>(false);

  // Tamanho do lote (40, 80 Turbo ou 120 Ultra)
  const [tamanhoLote, setTamanhoLote] = useState<number>(() => {
    try {
      const salvo = localStorage.getItem('belaped_tamanho_lote');
      return salvo ? Number(salvo) : 80; // Padrão: 80 itens
    } catch {
      return 80;
    }
  });

  // Filtro de prioridade da cotação ('TODAS_PRIORITARIAS', 'P1', 'P2', 'P3')
  const [filtroPrioridade, setFiltroPrioridade] = useState<'TODAS_PRIORITARIAS' | 'P1' | 'P2' | 'P3'>('TODAS_PRIORITARIAS');

  // Contador regressivo para o próximo lote
  const [countdownProximoLote, setCountdownProximoLote] = useState<number | null>(null);
  const disparandoRef = useRef(false);
  const ultimoEncontradosRef = useRef(0);
  const ultimoJaCotadosRef = useRef(0);
  const ultimoAtualRef = useRef(0);
  const estavaEmAndamentoRef = useRef(false);
  const ultimaAtualizacaoTabelaRef = useRef(0);
  const aguardandoRoboCountRef = useRef(aguardandoRoboCount);
  aguardandoRoboCountRef.current = aguardandoRoboCount;
  const onDadosAtualizadosRef = useRef(onDadosAtualizados);
  onDadosAtualizadosRef.current = onDadosAtualizados;

  // Controle de Auto-Fila voluntária
  const handleToggleModoContinuo = () => {
    const novoValor = !modoContinuo;
    setModoContinuo(novoValor);
    try {
      localStorage.setItem('belaped_modo_continuo', String(novoValor));
    } catch {}
    if (!novoValor) {
      setCountdownProximoLote(null);
      setSessaoUsuarioAtiva(false);
    } else {
      // Se ativou e não está rodando, inicia a sessão
      if (!emAndamento && aguardandoRoboCount > 0) {
        setSessaoUsuarioAtiva(true);
        onDispararRobo('TODOS', tamanhoLote, filtroPrioridade);
      }
    }
  };

  const handleMudarTamanhoLote = (novoTamanho: number) => {
    setTamanhoLote(novoTamanho);
    try {
      localStorage.setItem('belaped_tamanho_lote', String(novoTamanho));
    } catch {}
  };

  const handlePararRobo = async () => {
    try {
      setParando(true);
      setCountdownProximoLote(null);
      setSessaoUsuarioAtiva(false);
      await fetch('/api/belaped/parar-cotacao', { method: 'POST' });
      setTimeout(() => setParando(false), 2000);
    } catch (e) {
      setParando(false);
    }
  };

  const handleReiniciarRobo = async () => {
    try {
      setReiniciando(true);
      setCountdownProximoLote(null);
      setSessaoUsuarioAtiva(true);
      await fetch('/api/belaped/reiniciar-cotacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedor: 'TODOS',
          limite: tamanhoLote,
          prioridade: filtroPrioridade,
          dispararImediato: false
        })
      });
      // Dispara imediatamente o novo ciclo através da interface
      onDispararRobo('TODOS', tamanhoLote, filtroPrioridade);
      if (onDadosAtualizados) onDadosAtualizados();
    } catch (e) {
      console.error('Erro ao reiniciar robô:', e);
    } finally {
      setTimeout(() => setReiniciando(false), 1500);
    }
  };

  // Sincroniza prop inicial
  useEffect(() => {
    if (statusCotacao) {
      setLiveStatus(statusCotacao);
    }
  }, [statusCotacao]);

  // Polling dedicado para manter o mini-monitor sempre atualizado (SEM auto-disparo ao abrir a página)
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/belaped/status-cotacao');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.status) {
          setLiveStatus(data.status);

          const emAndamentoBackend = Boolean(data.status.emAndamento);
          const jaCotadosAtual = Number(data.status.fila?.jaCotados || 0);
          const encontradosAtual = Number(data.status.encontrados || 0);
          const atualNoLote = Number(data.status.atual || 0);
          const agora = Date.now();

          // 1. Cotação acabou de finalizar este lote: sincroniza tabela imediatamente!
          if (estavaEmAndamentoRef.current && !emAndamentoBackend) {
            estavaEmAndamentoRef.current = false;
            ultimoEncontradosRef.current = 0;
            ultimoJaCotadosRef.current = jaCotadosAtual;
            ultimoAtualRef.current = 0;
            ultimaAtualizacaoTabelaRef.current = agora;
            if (onDadosAtualizadosRef.current) onDadosAtualizadosRef.current();
          }
          // 2. Cotação está em andamento no backend:
          else if (emAndamentoBackend) {
            estavaEmAndamentoRef.current = true;

            // Houve novos itens cotados, novos preços encontrados ou avanço no lote
            const houveNovosCotados = jaCotadosAtual !== ultimoJaCotadosRef.current;
            const houveNovosEncontrados = encontradosAtual !== ultimoEncontradosRef.current;
            const loteAvancou = atualNoLote >= ultimoAtualRef.current + 2;

            // Atualiza a tabela com debounce de segurança (a cada ~4s para fluidez sem sobrecarga)
            if ((houveNovosCotados || houveNovosEncontrados || loteAvancou) && (agora - ultimaAtualizacaoTabelaRef.current > 4000)) {
              ultimoJaCotadosRef.current = jaCotadosAtual;
              ultimoEncontradosRef.current = encontradosAtual;
              ultimoAtualRef.current = atualNoLote;
              ultimaAtualizacaoTabelaRef.current = agora;
              if (onDadosAtualizadosRef.current) onDadosAtualizadosRef.current();
            }
          }

          const totalNaFila = Number(data.status.fila?.aguardandoRobo ?? aguardandoRoboCountRef.current);

          // Se o backend estava cotando ou se o usuário ativou modo contínuo, mantém a sessão ativa para emendar os lotes
          if (emAndamentoBackend && modoContinuo && !sessaoUsuarioAtiva) {
            setSessaoUsuarioAtiva(true);
          }

          // A Auto-Fila emenda próximo lote se o usuário tiver sessão ativa (ou modo contínuo ativo)
          if (
            (sessaoUsuarioAtiva || modoContinuo) &&
            modoContinuo &&
            !emAndamentoBackend &&
            !disparandoRef.current &&
            totalNaFila > 0
          ) {
            setCountdownProximoLote(prev => (prev === null ? 3 : prev));
          } else if (emAndamentoBackend || totalNaFila === 0 || (!sessaoUsuarioAtiva && !modoContinuo)) {
            setCountdownProximoLote(null);
          }
        }
      } catch (e) {}
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2500);
    return () => clearInterval(interval);
  }, [modoContinuo, sessaoUsuarioAtiva]);

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
      onDispararRobo('TODOS', tamanhoLote, filtroPrioridade);
      setTimeout(() => {
        disparandoRef.current = false;
      }, 5000);
    }
  }, [countdownProximoLote, onDispararRobo, tamanhoLote, filtroPrioridade]);

  const emAndamento = Boolean(liveStatus?.emAndamento || cotandoAoVivo);
  const totalLote = Number(liveStatus?.total) || 0;
  const atualLote = Number(liveStatus?.atual) || 0;
  const encontradosLote = Number(liveStatus?.encontrados) || 0;
  const pct = totalLote > 0 ? Math.min(100, Math.round((atualLote / totalLote) * 100)) : 0;

  const fila = liveStatus?.fila || {};
  const p1Aguardando = Number(fila.p1Aguardando || 0);
  const p2Aguardando = Number(fila.p2Aguardando || 0);
  const p3Aguardando = Number(fila.p3Aguardando || 0);
  const p4Aguardando = Number(fila.p4Aguardando || 0);
  const totalUrgentes = p1Aguardando + p2Aguardando + p3Aguardando;

  const prioridadeAtiva = liveStatus?.prioridadeAtiva || (
    p1Aguardando > 0 ? '🚨 P1: Ruptura Crítica' :
    p2Aguardando > 0 ? '⚠️ P2: Risco Iminente' :
    p3Aguardando > 0 ? '💼 P3: Orçamento Semanal' :
    '📦 P4: Regular'
  );

  const lotesEstimadosRestantes = Math.ceil((totalUrgentes > 0 ? totalUrgentes : aguardandoRoboCount) / Math.max(1, tamanhoLote));

  const workers: Record<string, WorkerStatus> = liveStatus?.workers || {
    'PROFARMA': { status: emAndamento ? 'COTANDO' : 'PRONTO', itemAtual: 'Aguardando disparo', avaliados: 0, encontrados: 0, semEstoque: 0 },
    'DPC DISTRIBUIDORA': { status: emAndamento ? 'COTANDO' : 'PRONTO', itemAtual: 'Aguardando disparo', avaliados: 0, encontrados: 0, semEstoque: 0 },
    'SOTON FARMA': { status: emAndamento ? 'COTANDO' : 'PRONTO', itemAtual: 'Aguardando disparo', avaliados: 0, encontrados: 0, semEstoque: 0 },
    'DISTRIMED': { status: emAndamento ? 'COTANDO' : 'PRONTO', itemAtual: 'Aguardando disparo', avaliados: 0, encontrados: 0, semEstoque: 0 },
    'DIVIMED': { status: emAndamento ? 'COTANDO' : 'PRONTO', itemAtual: 'Aguardando disparo', avaliados: 0, encontrados: 0, semEstoque: 0 },
    'MARTINS ATACADO': { status: emAndamento ? 'COTANDO' : 'PRONTO', itemAtual: 'Aguardando disparo', avaliados: 0, encontrados: 0, semEstoque: 0 },
    'ORIENTE FARMA': { status: emAndamento ? 'COTANDO' : 'PRONTO', itemAtual: 'Aguardando disparo', avaliados: 0, encontrados: 0, semEstoque: 0 }
  };

  const logsRecentes: LogEntry[] = Array.isArray(liveStatus?.log)
    ? [...liveStatus.log].slice(-12).reverse()
    : [];

  if (minimizado && modoDiscreto) {
    return (
      <button
        type="button"
        onClick={() => setMinimizado(false)}
        className={`fixed bottom-3 right-3 z-[70] flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border shadow-xl transition-all cursor-pointer select-none hover:scale-105 ${
          emAndamento
            ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-200 shadow-emerald-950/80'
            : aguardandoRoboCount > 0
              ? 'bg-[#09101e]/90 border-cyan-500/50 text-cyan-200 shadow-cyan-950/80'
              : 'bg-[#09101e]/85 border-slate-700/70 text-slate-300'
        }`}
        title="Clique para abrir o Monitor do Robô BelaPed"
      >
        <Bot className={`w-3.5 h-3.5 shrink-0 ${emAndamento ? 'text-emerald-400 animate-bounce' : 'text-cyan-400'}`} />
        <span className="text-[11px] font-black uppercase tracking-wider whitespace-nowrap">
          {emAndamento
            ? `Robô: ${atualLote}/${totalLote}`
            : aguardandoRoboCount > 0
              ? `Robô (${aguardandoRoboCount} fila)`
              : 'Robô Pronto'}
        </span>
        <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[80] w-[375px] sm:w-[435px] rounded-2xl bg-[#09101e]/95 backdrop-blur-md border-2 border-cyan-500/50 shadow-2xl shadow-cyan-950/80 text-slate-100 overflow-hidden transition-all duration-300">
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
                    ? `Fila: ${aguardandoRoboCount} itens (Foco: ${prioridadeAtiva})`
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
          {/* Matriz de Gravidade Operacional da Fila (Corte Inteligente) */}
          <div className="p-2.5 rounded-xl bg-[#060b14] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                Matriz de Gravidade (Corte Inteligente)
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                Foco: {prioridadeAtiva.split(':')[0]}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 text-center">
              {/* P1 */}
              <div className={`p-1.5 rounded-lg border flex flex-col items-center justify-between ${
                p1Aguardando > 0
                  ? 'bg-rose-950/40 border-rose-500/60 text-rose-200'
                  : 'bg-slate-900/40 border-slate-800 text-slate-500'
              }`}>
                <div className="text-[9px] font-black uppercase">P1 Crítico</div>
                <div className="text-xs font-black my-0.5">{p1Aguardando}</div>
                <div className="text-[8px] opacity-80 leading-tight">Estoque 0</div>
              </div>

              {/* P2 */}
              <div className={`p-1.5 rounded-lg border flex flex-col items-center justify-between ${
                p2Aguardando > 0
                  ? 'bg-amber-950/40 border-amber-500/60 text-amber-200'
                  : 'bg-slate-900/40 border-slate-800 text-slate-500'
              }`}>
                <div className="text-[9px] font-black uppercase">P2 Risco</div>
                <div className="text-xs font-black my-0.5">{p2Aguardando}</div>
                <div className="text-[8px] opacity-80 leading-tight">&lt; 3 dias</div>
              </div>

              {/* P3 */}
              <div className={`p-1.5 rounded-lg border flex flex-col items-center justify-between ${
                p3Aguardando > 0
                  ? 'bg-blue-950/40 border-blue-500/60 text-blue-200'
                  : 'bg-slate-900/40 border-slate-800 text-slate-500'
              }`}>
                <div className="text-[9px] font-black uppercase">P3 Orçam.</div>
                <div className="text-xs font-black my-0.5">{p3Aguardando}</div>
                <div className="text-[8px] opacity-80 leading-tight">Semanal</div>
              </div>

              {/* P4 */}
              <div className="p-1.5 rounded-lg border bg-slate-950/60 border-slate-800/80 text-slate-500 flex flex-col items-center justify-between" title="P4 é cortado automaticamente até que P1, P2 e P3 estejam cotados">
                <div className="text-[9px] font-black uppercase">P4 Regular</div>
                <div className="text-xs font-black my-0.5">{p4Aguardando}</div>
                <div className="text-[8px] text-slate-500 leading-tight">
                  {totalUrgentes > 0 ? 'Pausado' : 'Fila Ativa'}
                </div>
              </div>
            </div>
          </div>

          {/* Seletor de Desempenho e Velocidade (Tamanho do Lote) */}
          <div className="p-2.5 rounded-xl bg-[#060b14] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-300 flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                Desempenho por Ciclo
              </span>
              <span className="text-[10px] font-mono text-cyan-400">
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
                Total da Fila
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
              {/* Botão de Interrupção Imediata (quando o robô estiver cotando) */}
              {emAndamento && (
                <button
                  type="button"
                  disabled={parando}
                  onClick={handlePararRobo}
                  className="px-2.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black uppercase shadow-md transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 border border-rose-400 animate-pulse"
                  title="Interromper imediatamente os robôs de cotação"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>{parando ? 'Parando...' : 'Parar Robô'}</span>
                </button>
              )}

              {/* Botão de Reiniciar Cotação */}
              <button
                type="button"
                disabled={reiniciando}
                onClick={handleReiniciarRobo}
                className="px-2.5 py-2 rounded-xl bg-amber-950/70 hover:bg-amber-900/90 text-amber-300 border border-amber-600/70 text-[10px] font-black uppercase shadow-sm transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                title="Reiniciar a cotação: cancela qualquer robô travado e reinicia um novo ciclo de pesquisa do zero"
              >
                <RotateCcw className={`w-3 h-3 text-amber-400 ${reiniciando ? 'animate-spin' : ''}`} />
                <span>{reiniciando ? 'Reiniciando...' : 'Reiniciar'}</span>
              </button>

              {/* Toggle Auto-Fila Contínua */}
              <button
                type="button"
                onClick={handleToggleModoContinuo}
                className={`px-2.5 py-2 rounded-xl text-[10px] font-black uppercase border transition-all cursor-pointer flex items-center gap-1.5 shadow-sm ${
                  modoContinuo
                    ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-amber-900/30 font-black'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500'
                }`}
                title="Quando ativado, o robô emenda lotes automaticamente até zerar a fila. Por padrão fica desativado para não sobrecarregar o sistema."
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
                  setSessaoUsuarioAtiva(true);
                  onDispararRobo('TODOS', tamanhoLote, filtroPrioridade);
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
                    <span>Cotar Prioritários</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Horários Estratégicos Inteligentes */}
          <div className="p-2.5 rounded-xl bg-[#060b14] border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <div>
                <span className="text-[10px] font-black uppercase text-cyan-300 block">
                  Horários Estratégicos
                </span>
                <span className="text-[9px] text-slate-400 font-medium">
                  Cotações automáticas programadas:
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] font-black">
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800" title="Matinal: Antes da abertura (equipe chega com tudo cotado)">06:30</span>
              <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800" title="Meio-dia: Antes do corte de faturamento dos CDs">12:30</span>
              <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800" title="Fim de tarde: Fechamento noturno">17:45</span>
            </div>
          </div>

          {/* Banner de Próximo Lote Automático (quando finalizado mas com fila) */}
          {countdownProximoLote !== null && !emAndamento && (
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2">
                <FastForward className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>
                  Lote concluído! Disparando próximo ciclo em <b>{countdownProximoLote}s</b>...
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCountdownProximoLote(null);
                  setSessaoUsuarioAtiva(false);
                  setModoContinuo(false);
                }}
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
                  Lote atual ({prioridadeAtiva}): <b className="text-white">{atualLote}/{totalLote}</b> EANs
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

          {/* Grid Ao Vivo dos 7 Navegadores / Robôs */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Globe className="w-3 h-3 text-cyan-400" />
              Atividade em Tempo Real nos 7 Portais
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(['PROFARMA', 'DPC DISTRIBUIDORA', 'SOTON FARMA', 'DISTRIMED', 'DIVIMED', 'MARTINS ATACADO', 'ORIENTE FARMA'] as const).map((portal) => {
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
                    : 'Fila Inteligente: P1 (Ruptura) e P2 (Risco) são cotados com prioridade máxima para a farmácia.'}
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
