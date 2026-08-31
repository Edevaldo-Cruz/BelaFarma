import React, { useState, useEffect } from 'react';
import { 
  QrCode, 
  Smartphone, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Power, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Terminal, 
  Lock, 
  Server, 
  Info,
  Layers
} from 'lucide-react';
import { User } from '../../types';
import { useToast } from '../ToastContext';

interface ComprasWhatsAppConexaoProps {
  user: User;
  theme: 'light' | 'dark';
}

export const ComprasWhatsAppConexao: React.FC<ComprasWhatsAppConexaoProps> = ({
  user,
  theme
}) => {
  const { addToast } = useToast();
  const [status, setStatus] = useState<{
    connected: boolean;
    state: string;
    hasQR: boolean;
    qrCode?: string | null;
    phone?: string | null;
    error?: string | null;
    device?: string | null;
  }>({
    connected: false,
    state: 'disconnected',
    hasQR: false,
    qrCode: null,
    phone: null,
    error: null
  });

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [logs, setLogs] = useState<Array<{ time: string; msg: string; type: 'info' | 'warn' | 'success' | 'error' }>>([
    { time: new Date().toLocaleTimeString('pt-BR'), msg: 'Painel Baileys Compras iniciado.', type: 'info' },
    { time: new Date().toLocaleTimeString('pt-BR'), msg: 'Pasta de sessão dedicada: baileys-session-compras', type: 'info' }
  ]);

  const addLog = (msg: string, type: 'info' | 'warn' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev.slice(-40), { time: new Date().toLocaleTimeString('pt-BR'), msg, type }]);
  };

  const verificarStatus = async (showToast = false) => {
    try {
      setLoading(true);
      const res = await fetch('/api/central-compras/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          const s = data.data;
          const isConnected = Boolean(s.connected || s.isConnected || s.state === 'connected');
          setStatus({
            connected: isConnected,
            state: s.state || (isConnected ? 'connected' : 'disconnected'),
            hasQR: Boolean(s.hasQR || s.qrCode),
            qrCode: s.qrCode || null,
            phone: s.phone || null,
            error: s.error || null,
            device: s.device || null
          });

          if (showToast) {
            addToast(`Status da Conexão: ${isConnected ? 'Conectado' : 'Desconectado'}`, isConnected ? 'success' : 'info');
          }
        }
      }
    } catch (err: any) {
      addLog('Erro ao obter status do WhatsApp Compras: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    verificarStatus();
    const interval = setInterval(() => {
      verificarStatus(false);
    }, 15000); // Polling a cada 15 segundos
    return () => clearInterval(interval);
  }, []);

  const handleReconectar = async () => {
    try {
      setActionLoading(true);
      addLog('Disparando reinicialização de socket e geração de novo QR Code...', 'info');
      const res = await fetch('/api/central-compras/whatsapp/reconnect', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('🔄 Processo de reconexão iniciado. Aguarde o QR Code...', 'info');
        addLog('Novo QR Code gerado. Aponte a câmera do WhatsApp Comercial.', 'success');
        verificarStatus();
      } else {
        addToast('Erro na reconexão: ' + (data.error || 'Falha no servidor'), 'error');
        addLog('Falha ao reconectar: ' + (data.error || 'Erro desconhecido'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDesconectar = async () => {
    try {
      setActionLoading(true);
      addLog('Enviando comando para desconectar sessão do Baileys Compras...', 'warn');
      const res = await fetch('/api/central-compras/whatsapp/disconnect', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Sessão desconectada.', 'info');
        addLog('Sessão desconectada com sucesso.', 'info');
        verificarStatus();
      } else {
        addToast('Erro ao desconectar: ' + (data.error || 'Falha no servidor'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const isConectado = status.connected;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Banner de Isolamento e Segurança */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-600/10 via-blue-500/10 to-transparent border border-emerald-200 dark:border-emerald-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-md shrink-0">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              Instância Isolada: WhatsApp Comercial de Compras
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider">
                100% Segregado
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Esta sessão é exclusiva para cotações, envio de espelhos de compras e mineração com representantes. Não interfere no bot de atendimento a clientes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider ${
            isConectado 
              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' 
              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConectado ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {isConectado ? 'Conectado & Pronto' : 'Aguardando Pareamento'}
          </span>
        </div>
      </div>

      {/* Grid Principal: Card de Conexão + Terminal de Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card de Pareamento e QR Code */}
        <div className="p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-500" />
                Painel de Conexão Baileys
              </span>

              <button
                onClick={() => verificarStatus(true)}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="Testar status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Renderização do Status / QR Code */}
            <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center min-h-[300px] text-center">
              {isConectado ? (
                <div className="space-y-4 animate-in fade-in">
                  <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                    <CheckCircle2 className="w-10 h-10 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-slate-900 dark:text-white">
                      WhatsApp Comercial Conectado!
                    </h4>
                    {status.phone && (
                      <p className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                        +{status.phone}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-2 max-w-xs mx-auto">
                      Instância pronta para disparar cotações autorizadas e receber mensagens dos representantes.
                    </p>
                  </div>
                </div>
              ) : status.qrCode ? (
                <div className="space-y-4 animate-in fade-in">
                  <div className="p-4 bg-white rounded-2xl shadow-md inline-block border border-slate-200">
                    <img 
                      src={status.qrCode} 
                      alt="QR Code WhatsApp Compras" 
                      className="w-56 h-56 object-contain"
                    />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">
                      Escaneie com o WhatsApp Comercial
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Abra o WhatsApp no celular &gt; Aparelhos conectados &gt; Conectar um aparelho
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-slate-400">
                  <WifiOff className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Sessão desconectada ou em inicialização.
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-xs">
                    Clique no botão abaixo para gerar um novo QR Code de pareamento.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleReconectar}
              disabled={actionLoading}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
              Reconectar / Novo QR
            </button>

            <button
              onClick={handleDesconectar}
              disabled={actionLoading || !isConectado}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40"
            >
              <Power className="w-4 h-4" />
              Desconectar
            </button>
          </div>
        </div>

        {/* Terminal de Logs e Eventos */}
        <div className="p-6 rounded-[2.5rem] bg-slate-900 text-slate-100 border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Terminal de Eventos do Baileys
              </span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-mono text-slate-400">Live Monitor</span>
              </div>
            </div>

            {/* Container de Linhas de Log */}
            <div className="font-mono text-xs space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {logs.map((l, idx) => (
                <div key={idx} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-slate-500 shrink-0 text-[10px]">[{l.time}]</span>
                  <span className={
                    l.type === 'error' ? 'text-red-400 font-bold' :
                    l.type === 'warn' ? 'text-amber-400 font-bold' :
                    l.type === 'success' ? 'text-emerald-400 font-bold' :
                    'text-slate-300'
                  }>
                    {l.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <span>Sessão: backend/baileys-session-compras</span>
            <button
              onClick={() => setLogs([])}
              className="text-slate-400 hover:text-slate-200 underline cursor-pointer"
            >
              Limpar logs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
