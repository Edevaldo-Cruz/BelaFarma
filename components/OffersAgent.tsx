import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContext';
import {
  Sparkles, Bot, Image as ImageIcon, Trash2, Calendar, Clock,
  Upload, CheckCircle, RefreshCw, Send, AlertCircle, ChevronDown,
  CloudRain, Users, FolderOpen, Terminal, Download, History,
  Wifi, WifiOff, QrCode, RotateCcw, Edit, X
} from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

interface Offer {
  id: string;
  productName: string;
  price: number;
  category: string;
  mediaPath: string | null;
  aiCaption: string;
  createdAt: string;
}

interface Group {
  id: string;
  name?: string;
  subject?: string;
  isCustom?: boolean;
}

interface PostHistory {
  id: string;
  groupId: string;
  groupName: string;
  content: string;
  mediaPath: string | null;
  scheduledAt: string;
  status: string;
}

export default function OffersAgent() {
  const { addToast } = useToast();
  
  // State Lists
  const [offers, setOffers] = useState<Offer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [history, setHistory] = useState<PostHistory[]>([]);
  
  // Baileys Status
  const [baileysConnected, setBaileysConnected] = useState(false);
  const [baileysQR, setBaileysQR] = useState<string | null>(null);
  const [baileysReconnecting, setBaileysReconnecting] = useState(false);
  
  // Modal Edit States
  const [selectedOfferForEdit, setSelectedOfferForEdit] = useState<Offer | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPrice, setEditingPrice] = useState<number>(0);
  const [editingCategory, setEditingCategory] = useState('');
  const [editingCaption, setEditingCaption] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  
  // Form States
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [targetGroups, setTargetGroups] = useState<{id: string, name: string}[]>([]);
  const [savingTarget, setSavingTarget] = useState(false);
  
  // Custom Manual Group States
  const [isManualGroup, setIsManualGroup] = useState(false);
  const [manualGroupName, setManualGroupName] = useState('');
  const [savingCustomGroup, setSavingCustomGroup] = useState(false);
  const [sendingImmediateId, setSendingImmediateId] = useState<string | null>(null);
  
  // Loading States
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [openingFolder, setOpeningFolder] = useState(false);

  const fetchBaileysStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/baileys/status`);
      if (res.ok) {
        const data = await res.json();
        setBaileysConnected(data.connected);
        setBaileysQR(data.connected ? null : (data.qrCode || null));
      }
    } catch {}
  }, []);

  const handleReconnectBaileys = async () => {
    setBaileysReconnecting(true);
    try {
      await fetch(`${API_BASE}/api/whatsapp/baileys/reconnect`, { method: 'POST' });
      addToast('🔄 Reconexão iniciada! Aguarde o QR Code...', 'info');
      setTimeout(fetchBaileysStatus, 3000);
    } catch {
      addToast('Erro ao reconectar.', 'error');
    } finally {
      setBaileysReconnecting(false);
    }
  };

  const handleOpenEditModal = (offer: Offer) => {
    setSelectedOfferForEdit(offer);
    setEditingName(offer.productName);
    setEditingPrice(offer.price);
    setEditingCategory(offer.category);
    setEditingCaption(offer.aiCaption);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOfferForEdit) return;
    
    setSavingEdit(true);
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/offers-bank/${selectedOfferForEdit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: editingName,
          price: editingPrice,
          category: editingCategory,
          aiCaption: editingCaption
        })
      });

      if (res.ok) {
        addToast('✏️ Oferta atualizada com sucesso!', 'success');
        setSelectedOfferForEdit(null);
        fetchOffers();
      } else {
        const data = await res.json();
        addToast(data.error || 'Erro ao atualizar oferta.', 'error');
      }
    } catch {
      addToast('Erro de conexão ao salvar alterações.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const fetchTargetGroup = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/offers-bank/settings/target-group`);
      if (res.ok) {
        const data = await res.json();
        if (data.targetGroups && Array.isArray(data.targetGroups)) {
          setTargetGroups(data.targetGroups);
        }
      }
    } catch {}
  }, []);

  const saveTargetGroups = async (groupsList: {id: string, name: string}[]) => {
    setSavingTarget(true);
    try {
      await fetch(`${API_BASE}/api/whatsapp/offers-bank/settings/target-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetGroups: groupsList })
      });
      addToast('🎯 Grupos alvo atualizados!', 'success');
      setTargetGroups(groupsList);
    } catch {
      addToast('Erro ao salvar grupos alvo.', 'error');
    } finally {
      setSavingTarget(false);
    }
  };

  const addTargetGroup = (id: string, name: string) => {
    if (targetGroups.find(g => g.id === id)) return;
    saveTargetGroups([...targetGroups, { id, name }]);
  };

  const removeTargetGroup = (id: string) => {
    saveTargetGroups(targetGroups.filter(g => g.id !== id));
  };

  const handleSendImmediate = async (offer: Offer) => {
    if (targetGroups.length === 0) {
      addToast('Adicione pelo menos um Grupo Alvo no topo da página primeiro.', 'warning');
      return;
    }

    if (!confirm(`Deseja disparar imediatamente a oferta "${offer.productName}" para todos os ${targetGroups.length} grupos selecionados?`)) {
      return;
    }

    setSendingImmediateId(offer.id);
    let successCount = 0;
    
    try {
      for (const group of targetGroups) {
        const res = await fetch(`${API_BASE}/api/whatsapp/send-immediate-bank`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offerId: offer.id, groupId: group.id, groupName: group.name })
        });
        const data = await res.json();
        if (res.ok && data.success) successCount++;
      }
      
      if (successCount > 0) {
        addToast(`🚀 Oferta enviada para ${successCount} grupos!`, 'success');
        fetchHistory();
      } else {
        addToast('Erro ao agendar disparos.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    } finally {
      setSendingImmediateId(null);
    }
  };

  const handleSaveCustomGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualGroupName) return;
    setSavingCustomGroup(true);
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/custom-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: manualGroupName, name: manualGroupName })
      });
      if (res.ok) {
        addToast('Grupo customizado salvo!', 'success');
        await fetchGroups();
        addTargetGroup(manualGroupName, manualGroupName);
        setIsManualGroup(false);
        setManualGroupName('');
      }
    } finally {
      setSavingCustomGroup(false);
    }
  };

  const handleDeleteCustomGroup = async (id: string) => {
    if (!confirm('Remover grupo customizado do banco local?')) return;
    try {
      await fetch(`${API_BASE}/api/whatsapp/custom-groups/${id}`, { method: 'DELETE' });
      removeTargetGroup(id);
      fetchGroups();
    } catch {}
  };

  const handleDownloadImage = async (mediaPath: string, productName: string) => {
    try {
      const response = await fetch(`${API_BASE}${mediaPath}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${productName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const fetchOffers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/offers-bank`);
      if (res.ok) setOffers(await res.json());
    } finally {
      setLoadingOffers(false);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/groups`);
      if (res.ok) setGroups(await res.json());
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/offers-bank/history`);
      if (res.ok) setHistory(await res.json());
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
    fetchGroups();
    fetchHistory();
    fetchTargetGroup();
    fetchBaileysStatus();
    
    // Polling do historico e status baileys
    const historyInterval = setInterval(fetchHistory, 10000);
    const baileysInterval = setInterval(fetchBaileysStatus, 5000);
    return () => { clearInterval(historyInterval); clearInterval(baileysInterval); };
  }, [fetchOffers, fetchGroups, fetchHistory, fetchTargetGroup, fetchBaileysStatus]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setMediaFiles(filesArray);
      
      const previews: string[] = [];
      filesArray.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          previews.push(reader.result as string);
          if (previews.length === filesArray.length) setImagePreviews(previews);
        };
        reader.readAsDataURL(file);
      });
    } else {
      setMediaFiles([]);
      setImagePreviews([]);
    }
  };

  const handleAddOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mediaFiles.length === 0) return;
    setSubmittingOffer(true);
    addToast(`Processando ${mediaFiles.length} imagem(ns)...`, 'info');
    let successCount = 0;
    
    for (const file of mediaFiles) {
      try {
        const formData = new FormData();
        formData.append('media', file);
        const res = await fetch(`${API_BASE}/api/whatsapp/offers-bank`, { method: 'POST', body: formData });
        const data = await res.json();
        if (res.ok && data.success) {
          successCount++;
          addToast(`Cadastrado: ${data.offer.productName}`, 'success');
        }
      } catch {}
    }
    
    if (successCount > 0) {
      setMediaFiles([]);
      setImagePreviews([]);
      fetchOffers();
    }
    setSubmittingOffer(false);
  };

  const handleDeleteOffer = async (id: string) => {
    if (!confirm('Deseja deletar?')) return;
    try {
      await fetch(`${API_BASE}/api/whatsapp/offers-bank/${id}`, { method: 'DELETE' });
      fetchOffers();
    } catch {}
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      
      {/* Premium Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-500 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-inner">
              <span className="text-4xl">🤖</span>
            </div>
            <div>
              <h1 className="text-2xl font-black">Robô de Ofertas (Automático)</h1>
              <p className="text-indigo-100 text-sm font-medium">Agendamento Inteligente Just-In-Time</p>
            </div>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2 border ${
            baileysConnected
              ? 'bg-emerald-500/20 text-emerald-100 border-emerald-500/30'
              : 'bg-red-500/20 text-red-100 border-red-500/30'
          }`}>
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute h-full w-full rounded-full opacity-75 ${baileysConnected ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
              <span className={`relative rounded-full h-2 w-2 ${baileysConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
            </span>
            {baileysConnected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
          </span>
        </div>
      </div>

      {/* QR Code Card — aparece quando Baileys não está conectado */}
      {!baileysConnected && (
        <div className="bg-white dark:bg-slate-900 border-2 border-amber-300 dark:border-amber-600 rounded-3xl p-6 shadow-lg">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center gap-2 mb-2 justify-center md:justify-start">
                <WifiOff className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-black text-slate-800 dark:text-slate-200">WhatsApp Desconectado</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Escaneie o QR Code ao lado para conectar o robô ao WhatsApp. Sem isso, as mensagens não serão enviadas.</p>
              <div className="text-xs text-slate-400 space-y-1 mb-4">
                <p>1. Abra o <strong className="text-slate-600 dark:text-slate-300">WhatsApp</strong> no celular</p>
                <p>2. Toque em <strong className="text-slate-600 dark:text-slate-300">⋮ → Aparelhos Conectados</strong></p>
                <p>3. Toque em <strong className="text-slate-600 dark:text-slate-300">Conectar Aparelho</strong></p>
                <p>4. Aponte a câmera para o QR Code</p>
              </div>
              <button
                onClick={handleReconnectBaileys}
                disabled={baileysReconnecting}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm flex items-center gap-2 mx-auto md:mx-0 disabled:opacity-60"
              >
                {baileysReconnecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Gerar Novo QR Code
              </button>
            </div>
            <div className="shrink-0">
              {baileysQR ? (
                <div className="bg-white p-3 rounded-2xl shadow-md border border-slate-200">
                  <img src={baileysQR} alt="QR Code WhatsApp" className="w-56 h-56 rounded-xl" />
                </div>
              ) : (
                <div className="w-56 h-56 bg-slate-100 dark:bg-slate-800 rounded-2xl flex flex-col items-center justify-center gap-2">
                  <QrCode className="w-10 h-10 text-slate-300" />
                  <p className="text-xs text-slate-400 font-medium">Aguardando QR...</p>
                  <RefreshCw className="w-4 h-4 text-slate-300 animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Target Group Config */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-500 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Grupos Alvo do WhatsApp</h3>
              <p className="text-xs text-slate-500">O robô enviará 1 oferta do banco para estes grupos a cada hora (08h-20h, Seg-Sex).</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-72">
              <select
                value=""
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'manual') {
                    setIsManualGroup(true);
                  } else if (val !== '') {
                    setIsManualGroup(false);
                    const selectedGroupObj = groups.find(g => g.id === val);
                    const name = selectedGroupObj ? (selectedGroupObj.subject || selectedGroupObj.name || val) : val;
                    addTargetGroup(val, name);
                  }
                }}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 appearance-none"
              >
                <option value="">Adicionar grupo alvo...</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.isCustom ? `⭐ [Salvo] ${g.name}` : g.subject || g.name || g.id}</option>
                ))}
                <option value="manual">✍️ Digitar Manualmente...</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            {savingTarget && <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />}
          </div>
        </div>

        {/* Selected Groups Chips */}
        {targetGroups.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            {targetGroups.map(group => (
              <div key={group.id} className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                <span className="text-xs font-bold">{group.name}</span>
                <button onClick={() => removeTargetGroup(group.id)} className="hover:text-red-500 transition-colors p-0.5 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {isManualGroup && (
          <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-4 flex gap-3 items-center">
            <input
              type="text"
              placeholder="Nome exato do grupo no WhatsApp"
              value={manualGroupName}
              onChange={e => setManualGroupName(e.target.value)}
              className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold"
            />
            <button onClick={handleSaveCustomGroup} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold">Adicionar</button>
            <button onClick={() => setIsManualGroup(false)} className="px-4 py-2 text-slate-500 text-sm font-bold">Cancelar</button>
          </div>
        )}
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Tools */}
        <div className="lg:col-span-1 space-y-6">
          {/* Upload Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" /> Adicionar Oferta (IA)
            </h3>
            <form onSubmit={handleAddOffer} className="space-y-4">
              <div className="relative flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:border-indigo-500 transition-colors min-h-[120px]">
                <input type="file" multiple accept="image/*" onChange={handleImageChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                {imagePreviews.length > 0 ? (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {imagePreviews.slice(0,4).map((p, i) => (
                      <img key={i} src={p} className="w-14 h-14 rounded-lg object-cover" />
                    ))}
                    {imagePreviews.length > 4 && <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">+{imagePreviews.length-4}</div>}
                  </div>
                ) : (
                  <div className="text-center"><Upload className="w-5 h-5 mx-auto text-indigo-400 mb-1" /><p className="text-xs font-bold text-slate-500">Arraste imagens</p></div>
                )}
              </div>
              <button type="submit" disabled={submittingOffer} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow flex justify-center items-center gap-2 disabled:opacity-70">
                {submittingOffer ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Processar com IA
              </button>
            </form>
          </div>

          {/* RPA Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm relative overflow-hidden">
            <Bot className="absolute -right-4 -bottom-4 w-24 h-24 opacity-[0.03]" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-500" /> Robô Windows
            </h3>
            <div className="space-y-2">
              <button onClick={() => window.open(`${API_BASE}/api/system/download-agent`, '_blank')} className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs flex justify-center items-center gap-2">
                <Download className="w-3.5 h-3.5" /> Baixar Instalador (.ZIP)
              </button>
              <button onClick={async () => { setOpeningFolder(true); await fetch(`${API_BASE}/api/system/open-agent-folder`); setOpeningFolder(false); }} disabled={openingFolder} className="w-full py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold rounded-xl text-xs flex justify-center items-center gap-2">
                {openingFolder ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />} Abrir Pasta Local
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: History */}
        <div className="lg:col-span-2">
          {/* History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-500" /> Histórico de Disparos
              </h3>
              <button onClick={fetchHistory} className="p-1 text-slate-400 hover:text-indigo-500"><RefreshCw className="w-4 h-4" /></button>
            </div>
            
            {loadingHistory ? (
              <div className="py-8 flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-slate-300" /></div>
            ) : history.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400 font-medium border border-dashed border-slate-200 rounded-xl">Nenhum disparo registrado ainda.</div>
            ) : (
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
                {history.map(post => (
                  <div key={post.id} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                    {post.mediaPath ? (
                      <img src={`${API_BASE}${post.mediaPath}`} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0"><ImageIcon className="w-5 h-5 text-slate-400" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{post.groupName}</p>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${post.status === 'Pendente' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                          {post.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{post.content}</p>
                      <p className="text-[9px] text-slate-400 font-medium mt-1">
                        {new Date(post.scheduledAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Offers Bank (Full Width) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-indigo-500" /> Banco de Opções para IA
          </h3>
          <span className="text-xs font-black bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-slate-600 dark:text-slate-300">{offers.length} opções</span>
        </div>

        {loadingOffers ? (
          <div className="py-8 flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : offers.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400 font-medium border border-dashed border-slate-200 rounded-xl">O banco está vazio. Adicione opções acima.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin">
            {offers.map(offer => (
              <div key={offer.id} className="group relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800 flex flex-col">
                <div className="aspect-square relative">
                  {offer.mediaPath ? (
                    <img src={`${API_BASE}${offer.mediaPath}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-slate-300" /></div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button onClick={() => handleSendImmediate(offer)} className="p-1.5 bg-indigo-500 text-white rounded-md hover:bg-indigo-600" title="Disparar Agora"><Send className="w-3.5 h-3.5"/></button>
                    <button onClick={() => handleOpenEditModal(offer)} className="p-1.5 bg-amber-500 text-white rounded-md hover:bg-amber-600" title="Editar"><Edit className="w-3.5 h-3.5"/></button>
                    <button onClick={() => handleDeleteOffer(offer.id)} className="p-1.5 bg-red-500 text-white rounded-md hover:bg-red-600" title="Excluir"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                </div>
                <div className="p-2 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-bold text-slate-800 dark:text-slate-200 truncate" title={offer.productName}>{offer.productName}</p>
                  <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-black">R$ {offer.price.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Offer Modal */}
      {selectedOfferForEdit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Editar Detalhes da Oferta</h3>
              </div>
              <button 
                onClick={() => setSelectedOfferForEdit(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {/* Product Name */}
              <div>
                <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nome do Produto</label>
                <input
                  type="text"
                  required
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Price & Category */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Preço (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingPrice}
                    onChange={e => setEditingPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Categoria</label>
                  <select
                    value={editingCategory}
                    onChange={e => setEditingCategory(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="vitamina">Vitamina</option>
                    <option value="beleza">Beleza</option>
                    <option value="dor">Dor / Sintomas</option>
                    <option value="higiene">Higiene</option>
                    <option value="infantil">Infantil</option>
                    <option value="geral">Geral</option>
                  </select>
                </div>
              </div>

              {/* AI Caption / Text */}
              <div>
                <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Legenda Promocional (WhatsApp)</label>
                <textarea
                  rows={4}
                  required
                  value={editingCaption}
                  onChange={e => setEditingCaption(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none resize-none scrollbar-thin animate-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedOfferForEdit(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold rounded-xl text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow flex items-center gap-2 disabled:opacity-75"
                >
                  {savingEdit ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
