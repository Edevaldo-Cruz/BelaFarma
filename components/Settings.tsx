
import React from 'react';
import { 
  User as UserIcon, 
  Bell, 
  Database, 
  PlusSquare, 
  MapPin, 
  Trash2, 
  Download, 
  Cloud, 
  ShoppingBag,
  ShoppingCart,
  Percent, 
  Save, 
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Power,
  QrCode,
  Activity,
  Server,
  HardDrive,
  Cpu,
  Sparkles,
  GitCommit,
  Clock,
  Layers
} from 'lucide-react';
import { User, UserRole, MonthlyLimit } from '../types';
import { isAtlasConfigured } from '../lib/mongodb';
import { MonthlyLimits } from './MonthlyLimits';
import { useToast } from './ToastContext';

interface SettingsProps { 
  user: User;
  limits: MonthlyLimit[];
  onSaveLimit: (limit: MonthlyLimit) => void;
}

export const Settings: React.FC<SettingsProps> = ({ user, limits, onSaveLimit }) => {
  const { addToast } = useToast();
  const [ifoodFee, setIfoodFee] = React.useState('6.5');
  const [ifoodFeeOriginal, setIfoodFeeOriginal] = React.useState('6.5');
  const [ifoodFeeSaving, setIfoodFeeSaving] = React.useState(false);


  // --- WhatsApp Baileys Status & Reconnect (Principal, Secundário e Comercial) ---
  const [baileysStatus, setBaileysStatus] = React.useState<any>(null);
  const [baileysReconnecting, setBaileysReconnecting] = React.useState(false);

  const [secondaryStatus, setSecondaryStatus] = React.useState<any>(null);
  const [secondaryReconnecting, setSecondaryReconnecting] = React.useState(false);

  const [comprasStatus, setComprasStatus] = React.useState<any>(null);
  const [comprasReconnecting, setComprasReconnecting] = React.useState(false);

  // --- System Health ---
  const [systemHealth, setSystemHealth] = React.useState<any>(null);
  const [healthLoading, setHealthLoading] = React.useState(false);

  const fetchSystemHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/system/status');
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
      }
    } catch (err) {
      console.error('Error fetching system health:', err);
    } finally {
      setHealthLoading(false);
    }
  };

  const [syncingShortages, setSyncingShortages] = React.useState(false);

  const handleSyncDelayedShortages = async () => {
    setSyncingShortages(true);
    addToast('🔄 Iniciando busca e lançamento de faltas atrasadas dos últimos 30 dias...', 'info');
    try {
      const res = await fetch('/api/run-auto-shortages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 30 })
      });
      if (res.ok) {
        const data = await res.json();
        const added = data.result?.added || 0;
        const attention = data.result?.attention || 0;
        addToast(`✅ Lançamento concluído! Adicionados: ${added} itens zerados e ${attention} itens com atenção.`, 'success');
        // Se houver a função fetchSystemHealth, podemos atualizar os dados
        fetchSystemHealth();
      } else {
        const errData = await res.json();
        addToast(`❌ Erro ao lançar faltas atrasadas: ${errData.error || 'Erro desconhecido'}`, 'error');
      }
    } catch (err: any) {
      console.error(err);
      addToast(`❌ Erro de conexão ao tentar lançar faltas atrasadas: ${err.message}`, 'error');
    } finally {
      setSyncingShortages(false);
    }
  };

  // --- WhatsApp Principal ---
  const fetchBaileysStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/baileys/status');
      if (res.ok) {
        const data = await res.json();
        setBaileysStatus(data);
      }
    } catch (err) {
      console.error('Error fetching Baileys status:', err);
    }
  };

  // --- WhatsApp Secundário ---
  const fetchSecondaryStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/secondary/status');
      if (res.ok) {
        const data = await res.json();
        setSecondaryStatus(data);
      }
    } catch (err) {
      console.error('Error fetching Secondary status:', err);
    }
  };

  // --- WhatsApp Comercial (Compras & Cotações) ---
  const fetchComprasStatus = async () => {
    try {
      const res = await fetch('/api/central-compras/whatsapp/status');
      if (res.ok) {
        const json = await res.json();
        setComprasStatus(json.data || json);
      }
    } catch (err) {
      console.error('Error fetching Compras WhatsApp status:', err);
    }
  };

  // Poll unificado: /status já retorna hasQR e qrCode.
  // Quando desconectado, pollar mais rápido (3s) para capturar o QR assim que gerado.
  // Quando conectado, pollar devagar (15s) só para manter o status atualizado.
  React.useEffect(() => {
    if (user.role !== UserRole.ADM) return;
    
    fetchBaileysStatus();
    fetchSecondaryStatus();
    fetchComprasStatus();
    fetchSystemHealth();

    const allConnected = baileysStatus?.connected && secondaryStatus?.connected && comprasStatus?.connected;
    const pollFrequency = allConnected ? 15000 : 3000;

    const interval = setInterval(() => {
      fetchBaileysStatus();
      fetchSecondaryStatus();
      fetchComprasStatus();
      // Health check a cada 15s apenas
      if (pollFrequency >= 15000) fetchSystemHealth();
    }, pollFrequency);

    return () => clearInterval(interval);
  }, [user.role, baileysStatus?.connected, secondaryStatus?.connected, comprasStatus?.connected]);

  // Health check separado a cada 30s quando em poll rápido
  React.useEffect(() => {
    if (user.role !== UserRole.ADM) return;
    if (baileysStatus?.connected && secondaryStatus?.connected && comprasStatus?.connected) return;
    
    const healthInterval = setInterval(fetchSystemHealth, 30000);
    return () => clearInterval(healthInterval);
  }, [user.role, baileysStatus?.connected, secondaryStatus?.connected, comprasStatus?.connected]);

  const handleBaileysReconnect = async () => {
    if (!confirm('Deseja realmente desconectar a sessão do WhatsApp Principal (PIX dos clientes) e gerar um novo QR Code?')) return;
    setBaileysReconnecting(true);
    setBaileysStatus({ connected: false, connecting: true, hasQR: false, qrCode: null });
    try {
      const res = await fetch('/api/whatsapp/baileys/reconnect', { method: 'POST' });
      if (res.ok) {
        addToast('Sessão Principal desconectada. Aguardando novo QR Code...', 'success');
        setTimeout(() => {
          fetchBaileysStatus();
        }, 2000);
      } else {
        throw new Error('Failed to reconnect');
      }
    } catch (err) {
      addToast('Erro ao desconectar sessão principal.', 'error');
    } finally {
      setBaileysReconnecting(false);
    }
  };

  const handleSecondaryReconnect = async () => {
    if (!confirm('Deseja realmente desconectar a sessão do WhatsApp Secundário (Etiquetas e disparos) e gerar um novo QR Code?')) return;
    setSecondaryReconnecting(true);
    setSecondaryStatus({ connected: false, connecting: true, hasQR: false, qrCode: null });
    try {
      const res = await fetch('/api/whatsapp/secondary/reconnect', { method: 'POST' });
      if (res.ok) {
        addToast('Sessão Secundária desconectada. Aguardando novo QR Code...', 'success');
        setTimeout(() => {
          fetchSecondaryStatus();
        }, 2000);
      } else {
        throw new Error('Failed to reconnect');
      }
    } catch (err) {
      addToast('Erro ao desconectar sessão secundária.', 'error');
    } finally {
      setSecondaryReconnecting(false);
    }
  };

  const handleComprasReconnect = async () => {
    if (!confirm('Deseja realmente desconectar a sessão do WhatsApp Comercial (Compras & Cotações) e gerar um novo QR Code?')) return;
    setComprasReconnecting(true);
    setComprasStatus({ connected: false, connecting: true, hasQR: false, qrCode: null });
    try {
      const res = await fetch('/api/central-compras/whatsapp/reconnect', { method: 'POST' });
      if (res.ok) {
        addToast('Sessão do WhatsApp Comercial reiniciada. Aguardando QR Code...', 'success');
        setTimeout(() => {
          fetchComprasStatus();
        }, 2000);
      } else {
        throw new Error('Failed to reconnect');
      }
    } catch (err) {
      addToast('Erro ao desconectar sessão do WhatsApp Comercial.', 'error');
    } finally {
      setComprasReconnecting(false);
    }
  };

  React.useEffect(() => {
    if (user.role === UserRole.ADM) {
      // Buscar taxa iFood
      fetch('/api/settings/ifood_fee_percent')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.value) {
            setIfoodFee(data.value);
            setIfoodFeeOriginal(data.value);
          }
        })
        .catch(err => console.error('Error fetching iFood fee:', err));
    }
  }, [user.role]);

  const saveIfoodFee = async () => {
    const numVal = parseFloat(ifoodFee);
    if (isNaN(numVal) || numVal < 0 || numVal > 100) {
      addToast('Informe um valor válido entre 0 e 100.', 'warning');
      return;
    }
    setIfoodFeeSaving(true);
    try {
      const res = await fetch('/api/settings/ifood_fee_percent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: String(numVal) }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setIfoodFeeOriginal(String(numVal));
      addToast(`Taxa iFood atualizada para ${numVal}%`, 'success');
    } catch (err) {
      console.error('Error saving iFood fee:', err);
      addToast('Erro ao salvar taxa iFood.', 'error');
    } finally {
      setIfoodFeeSaving(false);
    }
  };
  const handleReset = () => {
    if (confirm('ATENÇÃO: Isso apagará TODOS os registros salvos localmente no navegador. Se o Atlas estiver ativo, os dados na nuvem permanecerão. Deseja continuar?')) {
      localStorage.removeItem('belinha_orders_db');
      localStorage.removeItem('belinha_shortages_db');
      localStorage.removeItem('belinha_closing_history');
      localStorage.removeItem('belinha_safe_db');
      localStorage.removeItem('belinha_users_db');
      window.location.reload();
    }
  };

  const handleExport = () => {
    const data = {
      orders: localStorage.getItem('belinha_orders_db'),
      shortages: localStorage.getItem('belinha_shortages_db'),
      safe: localStorage.getItem('belinha_safe_db'),
      history: localStorage.getItem('belinha_closing_history'),
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `belinha_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Configurações</h1>
        <p className="text-slate-500 font-medium">belinha • Painel de Controle</p>
      </header>

      {user.role === UserRole.ADM && (
        <MonthlyLimits limits={limits} onSaveLimit={onSaveLimit} />
      )}

      {/* iFood Fee Configuration */}
      {user.role === UserRole.ADM && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shadow-sm">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">Configurações iFood</h3>
              <p className="text-xs text-slate-400 font-medium">Taxa da operadora aplicada automaticamente nas vendas</p>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-50">
            <div className="flex flex-col sm:flex-row items-end gap-4">
              <div className="flex-1 w-full">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Taxa da Operadora (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={ifoodFee}
                    onChange={(e) => setIfoodFee(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-lg text-red-600 outline-none focus:border-red-500 transition-all pr-12"
                  />
                  <Percent className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-300" />
                </div>
                <p className="text-[10px] text-slate-400 font-medium mt-2 ml-2">
                  Este valor será aplicado automaticamente em todas as vendas iFood registradas.
                </p>
              </div>
              <button
                onClick={saveIfoodFee}
                disabled={ifoodFeeSaving || ifoodFee === ifoodFeeOriginal}
                className="px-6 py-4 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-wide hover:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-red-600/20 whitespace-nowrap"
              >
                {ifoodFeeSaving ? (
                  <><Save className="w-4 h-4 animate-spin" /> Salvando...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Salvar Taxa</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MÓDULOS DE WHATSAPP (BAILEYS) ── */}
      {user.role === UserRole.ADM && (
        <div className="space-y-6">
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes scan {
              0% { top: 0%; }
              50% { top: 100%; }
              100% { top: 0%; }
            }
            .animate-scan {
              position: absolute;
              animation: scan 2s linear infinite;
            }
          `}} />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* 🟢 CARD WHATSAPP PRINCIPAL (AUDITORIA PIX) */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shadow-sm">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">WhatsApp Principal</h3>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">Auditoria Automática de PIX (Clientes)</p>
                    </div>
                  </div>
                  <div>
                    {baileysStatus?.connected ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-full">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        Conectado
                      </span>
                    ) : baileysStatus?.connecting ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-full">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Conectando
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-full">
                        Desconectado
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 space-y-4">
                  {baileysStatus?.connected ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl text-emerald-800 text-xs font-medium leading-relaxed">
                        🎉 <strong>Auditor de PIX Ativo!</strong> Conectado ao WhatsApp oficial da drogaria. Comprovantes enviados pelos clientes serão auditados instantaneamente pelo PixBot.
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={async () => {
                            if (!confirm('Deseja iniciar a varredura retroativa de todas as imagens enviadas hoje pelos clientes para buscar comprovantes de PIX?')) return;
                            try {
                              addToast('🔍 Varredura iniciada! Analisando mensagens de hoje...', 'info');
                              const res = await fetch('/api/whatsapp/baileys/varrer-pix-hoje', { method: 'POST' });
                              if (res.ok) {
                                const data = await res.json();
                                addToast(`✅ ${data.message || 'Varredura de PIX concluída!'}`, 'success');
                              } else {
                                throw new Error('Erro na API');
                              }
                            } catch (e) {
                              addToast('❌ Falha ao iniciar varredura de PIX de hoje.', 'error');
                            }
                          }}
                          className="flex-1 justify-center px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-wide transition-all flex items-center gap-2 shadow-sm"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Varrer Comprovantes PIX de Hoje
                        </button>
                        <button
                          onClick={handleBaileysReconnect}
                          disabled={baileysReconnecting}
                          className="px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-xl font-bold text-xs uppercase tracking-wide transition-all disabled:opacity-40 flex items-center gap-2"
                        >
                          <Power className="w-4 h-4" />
                          Desconectar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      <div className="md:col-span-7 space-y-2 text-slate-500 text-xs leading-relaxed">
                        <p className="font-bold text-slate-800">Passos para conectar o WhatsApp Principal:</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Abra o WhatsApp do celular principal da drogaria.</li>
                          <li>Toque em <strong>Aparelhos Conectados</strong>.</li>
                          <li>Aponte a câmera para o QR Code ao lado.</li>
                        </ol>
                        <div className="pt-2 flex flex-wrap gap-2">
                          <button
                            onClick={handleBaileysReconnect}
                            disabled={baileysReconnecting}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-[10px] uppercase tracking-wide transition-all flex items-center gap-1.5"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${baileysReconnecting ? 'animate-spin' : ''}`} />
                            Gerar QR
                          </button>
                          <button
                            onClick={fetchBaileysStatus}
                            className="px-3 py-2 border border-slate-200 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-wide transition-all hover:bg-slate-50"
                          >
                            Atualizar
                          </button>
                        </div>
                      </div>
                      <div className="md:col-span-5 flex justify-center pt-2 md:pt-0">
                        {baileysStatus?.hasQR && baileysStatus?.qrCode ? (
                          <div className="relative p-2 bg-white border-2 border-slate-100 rounded-2xl shadow-md overflow-hidden flex flex-col items-center">
                            <div className="absolute left-0 right-0 h-0.5 bg-emerald-500 opacity-80 animate-scan z-10" />
                            <img src={baileysStatus.qrCode} alt="QR Code Principal" className="w-32 h-32 object-contain relative" />
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Aguardando Scanner</span>
                          </div>
                        ) : (
                          <div className="w-32 h-32 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-4 text-center text-slate-400 bg-slate-50 gap-1.5">
                            {baileysStatus?.error ? (
                              <>
                                <span className="text-red-500 text-[8px] font-black uppercase tracking-widest leading-tight">Erro</span>
                                <span className="text-[7px] text-red-400 leading-tight break-all">{baileysStatus.error}</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-6 h-6 animate-spin text-slate-300" />
                                <span className="text-[8px] font-black uppercase tracking-widest leading-tight">Carregando...</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 🔵 CARD WHATSAPP SECUNDÁRIO (ETIQUETAS & DISPAROS) */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shadow-sm">
                      <QrCode className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">WhatsApp Secundário</h3>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">Robô de Etiquetas (Funcionários) e Envios</p>
                    </div>
                  </div>
                  <div>
                    {secondaryStatus?.connected ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-full">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                        Conectado
                      </span>
                    ) : secondaryStatus?.connecting ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-full">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Conectando
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-full">
                        Desconectado
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 space-y-4">
                  {secondaryStatus?.connected ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl text-blue-800 text-xs font-medium leading-relaxed">
                        🎉 <strong>Robô de Etiquetas Ativo!</strong> WhatsApp Secundário online. Os funcionários já podem enviar fotos, textos ou áudios para gerar etiquetas de preço, e disparos futuros estão liberados.
                      </div>
                      <button
                        onClick={handleSecondaryReconnect}
                        disabled={secondaryReconnecting}
                        className="w-full justify-center px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-xl font-bold text-xs uppercase tracking-wide transition-all disabled:opacity-40 flex items-center gap-2"
                      >
                        <Power className="w-4 h-4" />
                        Desconectar WhatsApp Secundário
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      <div className="md:col-span-7 space-y-2 text-slate-500 text-xs leading-relaxed">
                        <p className="font-bold text-slate-800">Passos para conectar o WhatsApp Secundário:</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Abra o WhatsApp no celular secundário dos funcionários.</li>
                          <li>Toque em <strong>Aparelhos Conectados</strong>.</li>
                          <li>Aponte a câmera para o QR Code ao lado.</li>
                        </ol>
                        <div className="pt-2 flex flex-wrap gap-2">
                          <button
                            onClick={handleSecondaryReconnect}
                            disabled={secondaryReconnecting}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-[10px] uppercase tracking-wide transition-all flex items-center gap-1.5"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${secondaryReconnecting ? 'animate-spin' : ''}`} />
                            Gerar QR
                          </button>
                          <button
                            onClick={fetchSecondaryStatus}
                            className="px-3 py-2 border border-slate-200 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-wide transition-all hover:bg-slate-50"
                          >
                            Atualizar
                          </button>
                        </div>
                      </div>
                      <div className="md:col-span-5 flex justify-center pt-2 md:pt-0">
                        {secondaryStatus?.hasQR && secondaryStatus?.qrCode ? (
                          <div className="relative p-2 bg-white border-2 border-slate-100 rounded-2xl shadow-md overflow-hidden flex flex-col items-center">
                            <div className="absolute left-0 right-0 h-0.5 bg-blue-500 opacity-80 animate-scan z-10" />
                            <img src={secondaryStatus.qrCode} alt="QR Code Secundário" className="w-32 h-32 object-contain relative" />
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Aguardando Scanner</span>
                          </div>
                        ) : (
                          <div className="w-32 h-32 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-4 text-center text-slate-400 bg-slate-50 gap-1.5">
                            {secondaryStatus?.error ? (
                              <>
                                <span className="text-red-500 text-[8px] font-black uppercase tracking-widest leading-tight">Erro</span>
                                <span className="text-[7px] text-red-400 leading-tight break-all">{secondaryStatus.error}</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-6 h-6 animate-spin text-slate-300" />
                                <span className="text-[8px] font-black uppercase tracking-widest leading-tight">Carregando...</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 🟣 CARD WHATSAPP COMERCIAL (CENTRAL DE COMPRAS & COTAÇÕES) */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl shadow-sm">
                      <ShoppingCart className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">WhatsApp Comercial</h3>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">Central de Compras, Cotações & Representantes</p>
                    </div>
                  </div>
                  <div>
                    {comprasStatus?.connected ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-700 text-[10px] font-black uppercase tracking-widest rounded-full">
                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
                        Conectado
                      </span>
                    ) : comprasStatus?.connecting ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-full">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Conectando
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-full">
                        Desconectado
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 space-y-4">
                  {comprasStatus?.connected ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl text-purple-800 text-xs font-medium leading-relaxed">
                        🎉 <strong>WhatsApp Comercial Ativo!</strong> A instância de compras está online e pronta para minerar ofertas dos representantes e redigir cotações com aprovação prévia.
                      </div>
                      <button
                        onClick={handleComprasReconnect}
                        disabled={comprasReconnecting}
                        className="w-full justify-center px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-xl font-bold text-xs uppercase tracking-wide transition-all disabled:opacity-40 flex items-center gap-2"
                      >
                        <Power className="w-4 h-4" />
                        Desconectar WhatsApp Comercial
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      <div className="md:col-span-7 space-y-2 text-slate-500 text-xs leading-relaxed">
                        <p className="font-bold text-slate-800">Passos para conectar o WhatsApp Comercial:</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Abra o WhatsApp no celular comercial de compras da drogaria.</li>
                          <li>Toque em <strong>Aparelhos Conectados</strong>.</li>
                          <li>Aponte a câmera para o QR Code ao lado.</li>
                        </ol>
                        <div className="pt-2 flex flex-wrap gap-2">
                          <button
                            onClick={handleComprasReconnect}
                            disabled={comprasReconnecting}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-[10px] uppercase tracking-wide transition-all flex items-center gap-1.5"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${comprasReconnecting ? 'animate-spin' : ''}`} />
                            Gerar QR
                          </button>
                          <button
                            onClick={fetchComprasStatus}
                            className="px-3 py-2 border border-slate-200 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-wide transition-all hover:bg-slate-50"
                          >
                            Atualizar
                          </button>
                        </div>
                      </div>
                      <div className="md:col-span-5 flex justify-center pt-2 md:pt-0">
                        {comprasStatus?.hasQR && comprasStatus?.qrCode ? (
                          <div className="relative p-2 bg-white border-2 border-slate-100 rounded-2xl shadow-md overflow-hidden flex flex-col items-center">
                            <div className="absolute left-0 right-0 h-0.5 bg-purple-500 opacity-80 animate-scan z-10" />
                            <img src={comprasStatus.qrCode} alt="QR Code Comercial" className="w-32 h-32 object-contain relative" />
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Aguardando Scanner</span>
                          </div>
                        ) : (
                          <div className="w-32 h-32 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-4 text-center text-slate-400 bg-slate-50 gap-1.5">
                            {comprasStatus?.error ? (
                              <>
                                <span className="text-red-500 text-[8px] font-black uppercase tracking-widest leading-tight">Erro</span>
                                <span className="text-[7px] text-red-400 leading-tight break-all">{comprasStatus.error}</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-6 h-6 animate-spin text-slate-300" />
                                <span className="text-[8px] font-black uppercase tracking-widest leading-tight">Carregando...</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}


      {/* ── PAINEL DE SAÚDE DO SISTEMA (HEALTH DASHBOARD) ── */}
      {user.role === UserRole.ADM && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shadow-sm">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">Saúde e Diagnóstico</h3>
                <p className="text-[10px] text-slate-400 font-medium leading-tight">Monitoramento do Servidor em Tempo Real</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSyncDelayedShortages}
                disabled={syncingShortages}
                className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl font-bold text-xs uppercase tracking-wide transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${syncingShortages ? 'animate-spin' : ''}`} />
                Lançar Faltas Atrasadas (30d)
              </button>
              <button
                onClick={fetchSystemHealth}
                disabled={healthLoading}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold text-xs uppercase tracking-wide transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${healthLoading ? 'animate-spin' : ''}`} />
                Diagnóstico
              </button>
            </div>
          </div>

          {systemHealth && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-50">
              
              {/* Database Status */}
              <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Database className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">Banco Local</span>
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full ${systemHealth.database.operational ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-800">{systemHealth.database.sizeMB} <span className="text-sm text-slate-500 font-bold">MB</span></p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">SQLite (belafarma.db)</p>
                </div>
              </div>

              {/* Memory Status */}
              <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Cpu className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">Memória do Node</span>
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-800">{systemHealth.system.processMemoryMB} <span className="text-sm text-slate-500 font-bold">MB</span></p>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                    <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (systemHealth.system.processMemoryMB / 2048) * 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Uso no servidor (Limite Sugerido: 2GB)</p>
                </div>
              </div>

              {/* Server Overall */}
              <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Server className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">Servidor Host</span>
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-800">
                    {Math.floor(systemHealth.system.uptimeSeconds / 3600)}h {Math.floor((systemHealth.system.uptimeSeconds % 3600) / 60)}m
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Tempo de Atividade (Uptime)</p>
                  <p className="text-[10px] text-slate-500 font-bold mt-2 pt-2 border-t border-slate-200">
                    RAM Livre: {systemHealth.system.freeMemoryMB} MB / {systemHealth.system.totalMemoryMB} MB
                  </p>
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shadow-sm">
              <UserIcon className="w-5 h-5" />
            </div>
            <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">Perfil de Acesso</h3>
          </div>
          <div className="space-y-3 pt-3 border-t border-slate-50">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identificação</p>
              <p className="text-slate-900 font-bold text-base capitalize">{user.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nível de Permissão</p>
              <div className="mt-1">
                <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  user.role === 'Administrador' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {user.role}
                </span>
              </div>
            </div>
            <div className="pt-1">
               <div className="flex items-center gap-2 text-slate-400">
                 <MapPin className="w-3.5 h-3.5" />
                 <span className="text-xs font-bold">Localidade: BelaFarma</span>
               </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shadow-sm">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">Banco de Dados Cloud</h3>
          </div>
          <div className="space-y-3 pt-3 border-t border-slate-50">
            <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <Cloud className={`w-4 h-4 ${isAtlasConfigured() ? 'text-emerald-500' : 'text-slate-300'}`} />
              <div className="truncate">
                <p className="text-[9px] font-black uppercase text-slate-400">Cluster Ativo</p>
                <p className="text-xs font-black text-slate-700 truncate">BancoBela (MongoDB Atlas)</p>
              </div>
              <div className="ml-auto">
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${isAtlasConfigured() ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                  {isAtlasConfigured() ? 'CONECTADO' : 'OFFLINE'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button 
                onClick={handleExport}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all shadow-sm"
              >
                <Download className="w-3.5 h-3.5" /> Exportar JSON
              </button>
              <button 
                onClick={handleReset}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border-2 border-red-100 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" /> Reset Local
              </button>
            </div>
          </div>
        </div>

        {/* Card de Versão do Sistema */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-xl shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">Versão do Sistema</h3>
              <p className="text-[10px] font-bold text-slate-400">Release & Build Automático</p>
            </div>
          </div>
          <div className="space-y-2.5 pt-3 border-t border-slate-50">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Versão Semântica</span>
              <span className="px-2 py-0.5 rounded-lg bg-orange-100 text-orange-800 text-xs font-mono font-black">
                v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0'}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Último Commit Git</span>
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="font-mono text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                  #{typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev'}
                </span>
                <p className="text-xs font-bold text-slate-800 line-clamp-2">
                  "{typeof __COMMIT_MESSAGE__ !== 'undefined' ? __COMMIT_MESSAGE__ : 'Atualização do sistema'}"
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 font-mono">
              <span>Compilado em:</span>
              <span className="font-bold text-slate-700">{typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'Recente'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
