import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContext';
import {
  Sparkles, Bot, Image as ImageIcon, Trash2, Calendar, Clock,
  Upload, CheckCircle, RefreshCw, Send, AlertCircle, ChevronDown,
  CloudRain, Users, DollarSign, CalendarCheck2, FolderOpen, ExternalLink,
  Terminal, Download
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

interface ScheduledSlot {
  day: string;
  hour: number;
  offerId: string;
  productName: string;
  mediaPath: string | null;
  content: string;
  motivoEstrategico: string;
}

export default function OffersAgent() {
  const { addToast } = useToast();
  
  // State Lists
  const [offers, setOffers] = useState<Offer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [proposedSchedule, setProposedSchedule] = useState<ScheduledSlot[]>([]);
  
  // Form States
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState('');
  
  // Custom Manual Group States
  const [isManualGroup, setIsManualGroup] = useState(false);
  const [manualGroupName, setManualGroupName] = useState('');
  const [savingCustomGroup, setSavingCustomGroup] = useState(false);
  const [sendingImmediateId, setSendingImmediateId] = useState<string | null>(null);
  
  // Loading States
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [confirmingSchedule, setConfirmingSchedule] = useState(false);
  const [currentWeather, setCurrentWeather] = useState('Consultando clima do Ipiranga...');
  const [openingFolder, setOpeningFolder] = useState(false);

  const handleSendImmediate = async (offer: Offer) => {
    if (!selectedGroup) {
      addToast('Selecione o Grupo Alvo do WhatsApp no final da página antes de disparar.', 'warning');
      return;
    }

    const groupObj = groups.find(g => g.id === selectedGroup || g.subject === selectedGroup);
    const groupLabel = groupObj ? (groupObj.subject || groupObj.name) : selectedGroup;

    if (!confirm(`Deseja disparar imediatamente a oferta "${offer.productName}" para o grupo "${groupLabel}"? O robô no seu Windows fará o envio em até 15 segundos!`)) {
      return;
    }

    setSendingImmediateId(offer.id);
    addToast('🚀 Enfileirando disparo imediato no robô...', 'info');

    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/send-immediate-bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: offer.id,
          groupId: selectedGroup,
          groupName: groupLabel
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('🎉 Sucesso! Oferta enviada para a fila de disparo imediato do robô!', 'success');
      } else {
        addToast(data.error || 'Erro ao agendar disparo imediato.', 'error');
      }
    } catch {
      addToast('Erro ao se conectar com o servidor.', 'error');
    } finally {
      setSendingImmediateId(null);
    }
  };

  const handleSaveCustomGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualGroupName) {
      addToast('Digite o nome exato do grupo do WhatsApp.', 'warning');
      return;
    }

    setSavingCustomGroup(true);
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/custom-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: manualGroupName, name: manualGroupName })
      });
      const data = await res.json();
      if (res.ok) {
        addToast('💾 Grupo customizado cadastrado com sucesso!', 'success');
        await fetchGroups();
        setSelectedGroup(manualGroupName);
        setIsManualGroup(false);
        setManualGroupName('');
      } else {
        addToast(data.error || 'Erro ao cadastrar grupo.', 'error');
      }
    } catch {
      addToast('Erro ao se conectar com o servidor.', 'error');
    } finally {
      setSavingCustomGroup(false);
    }
  };

  const handleDeleteCustomGroup = async (id: string) => {
    if (!confirm('Deseja realmente remover este grupo customizado?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/custom-groups/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        addToast('Grupo customizado removido da lista!', 'success');
        setSelectedGroup('');
        fetchGroups();
      } else {
        addToast('Erro ao remover grupo customizado.', 'error');
      }
    } catch {
      addToast('Erro de rede ao remover.', 'error');
    }
  };

  const handleOpenAgentFolder = async () => {
    setOpeningFolder(true);
    try {
      const res = await fetch(`${API_BASE}/api/system/open-agent-folder`);
      if (res.ok) {
        addToast('📂 Pasta do robô aberta com sucesso!', 'success');
      } else {
        addToast('Erro ao abrir pasta do robô local.', 'error');
      }
    } catch {
      addToast('Erro ao se conectar com o servidor local.', 'error');
    } finally {
      setOpeningFolder(false);
    }
  };

  const handleDownloadAgentZip = () => {
    window.open(`${API_BASE}/api/system/download-agent`, '_blank');
    addToast('📥 Preparando download do robô... Verifique sua barra de downloads!', 'info');
  };

  // 1. Fetch Offers from Server
  const fetchOffers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/offers-bank`);
      if (res.ok) {
        setOffers(await res.json());
      }
    } catch {
      addToast('Erro ao carregar banco de ofertas.', 'error');
    } finally {
      setLoadingOffers(false);
    }
  }, [addToast]);

  // 2. Fetch WhatsApp Groups
  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/groups`);
      if (res.ok) {
        setGroups(await res.json());
      }
    } catch {
      // Silencioso ou fallback
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
    fetchGroups();
  }, [fetchOffers, fetchGroups]);

  // Handle Image Select
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setMediaFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  // Submit Offer (100% IA Visual)
  const handleAddOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaFile) {
      addToast('Selecione uma imagem promocional primeiro.', 'warning');
      return;
    }

    setSubmittingOffer(true);
    addToast('🧠 A IA está analisando a imagem, extraindo o produto, preço e criando a legenda...', 'info');
    
    try {
      const formData = new FormData();
      formData.append('media', mediaFile);

      const res = await fetch(`${API_BASE}/api/whatsapp/offers-bank`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`✨ Cadastrado por IA: "${data.offer.productName}" (R$ ${data.offer.price.toFixed(2)})!`, 'success');
        setMediaFile(null);
        setImagePreview(null);
        fetchOffers();
      } else {
        addToast(data.error || 'Erro ao processar imagem.', 'error');
      }
    } catch {
      addToast('Erro ao conectar ao servidor.', 'error');
    } finally {
      setSubmittingOffer(false);
    }
  };

  // Delete Offer
  const handleDeleteOffer = async (id: string) => {
    if (!confirm('Deseja realmente remover esta oferta do banco?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/offers-bank/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        addToast('Oferta removida com sucesso.', 'success');
        fetchOffers();
      } else {
        addToast('Erro ao remover oferta.', 'error');
      }
    } catch {
      addToast('Erro de rede ao remover.', 'error');
    }
  };

  // Generate Schedule with AI based on Weather
  const handleGenerateSchedule = async () => {
    if (offers.length === 0) {
      addToast('Cadastre produtos no banco antes de planejar.', 'warning');
      return;
    }

    setGeneratingSchedule(true);
    addToast('🧠 O cérebro de marketing está planejando a escala ideal para JF...', 'info');

    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/offers-bank/generate-schedule`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setProposedSchedule(data.schedule || []);
        setCurrentWeather(data.clima || 'Clima normal');
        addToast('✅ Cronograma gerado e otimizado com IA com sucesso!', 'success');
      } else {
        addToast(data.error || 'Erro ao gerar cronograma.', 'error');
      }
    } catch {
      addToast('Erro ao conectar para gerar escala.', 'error');
    } finally {
      setGeneratingSchedule(false);
    }
  };

  // Confirm and Queue Schedule in the Database
  const handleConfirmSchedule = async () => {
    if (!selectedGroup) {
      addToast('Selecione o grupo do WhatsApp de destino.', 'warning');
      return;
    }
    if (proposedSchedule.length === 0) {
      addToast('Gere o cronograma com a IA antes de confirmar.', 'warning');
      return;
    }

    setConfirmingSchedule(true);
    addToast('🚀 Gravando disparos automáticos no banco...', 'info');

    try {
      const groupObj = groups.find(g => g.id === selectedGroup || g.subject === selectedGroup);
      const res = await fetch(`${API_BASE}/api/whatsapp/offers-bank/confirm-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: selectedGroup,
          groupName: groupObj ? (groupObj.subject || groupObj.name) : selectedGroup,
          items: proposedSchedule
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast('🎉 Excelente! Ofertas ativadas no Robô Windows!', 'success');
        setProposedSchedule([]);
      } else {
        addToast(data.error || 'Erro ao agendar ofertas.', 'error');
      }
    } catch {
      addToast('Erro ao salvar escala no banco.', 'error');
    } finally {
      setConfirmingSchedule(false);
    }
  };

  // Category Color Badges
  const getCategoryBadge = (cat: string) => {
    const list: Record<string, string> = {
      vitamina: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/30',
      beleza: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/30',
      dor: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/30',
      higiene: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/30',
      infantil: 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-900/30',
      geral: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-800'
    };
    return list[cat.toLowerCase()] || list.geral;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      
      {/* Premium Gradient Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-500 rounded-3xl p-8 text-white shadow-xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="h-20 w-20 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-inner border border-white/20">
              <span className="text-5xl drop-shadow-md">🤖</span>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight mb-1">Robô de Ofertas</h1>
              <p className="text-indigo-100 font-medium flex items-center gap-2">
                <span>Orquestrador Inteligente de WhatsApp</span>
                <span className="w-1.5 h-1.5 bg-indigo-300 rounded-full" />
                <span>Bela Farma Sul</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-4 py-2 bg-emerald-500/20 text-emerald-100 border border-emerald-500/30 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Disparador Conectado
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Upload Form vs Products Bank */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Upload / Cadastrar & Baixar Robô */}
        <div className="lg:col-span-1 space-y-6">
          {/* Nova Oferta com IA Form */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-5 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              Nova Oferta com IA
            </h3>
            
            <form onSubmit={handleAddOffer} className="space-y-4">
              
              {/* Image Uploader Card */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Imagem do Produto</label>
                <div className="relative group flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:border-indigo-500 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  
                  {imagePreview ? (
                    <div className="relative w-full h-40 rounded-xl overflow-hidden shadow-inner">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Upload className="w-8 h-8 text-white animate-bounce" />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 rounded-full flex items-center justify-center mx-auto shadow-sm">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-slate-500">Arraste ou clique para enviar</p>
                      <p className="text-[9px] text-slate-400">PNG, JPG ou JPEG (máx. 5MB)</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submittingOffer}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {submittingOffer ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />}
                {submittingOffer ? 'Analisando Imagem com IA...' : 'Criar Oferta ✨'}
              </button>
            </form>
          </div>

          {/* Robô de Envio Local (Windows) Setup */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute -right-10 -bottom-10 opacity-[0.03] dark:opacity-[0.05] pointer-events-none">
              <Bot className="w-40 h-40" />
            </div>
            
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
              <Bot className="w-5 h-5 text-emerald-500" />
              Robô de Envio Local (Windows)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-5 font-medium">
              Execute o robô localmente em sua máquina para processar os envios inteligentes automáticos e agendados no WhatsApp.
            </p>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={handleDownloadAgentZip}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer text-sm"
              >
                <Download className="w-4.5 h-4.5" />
                Baixar Instalador do Robô (.ZIP) 📥
              </button>

              <button
                onClick={handleOpenAgentFolder}
                disabled={openingFolder}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl border border-slate-200 dark:border-slate-700/60 transition-all disabled:opacity-75 cursor-pointer text-xs"
                title="Funciona apenas se o painel estiver rodando no mesmo computador"
              >
                {openingFolder ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
                Abrir Pasta Local do Robô 📂
              </button>
            </div>

            <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-5 space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-indigo-500" />
                Guia Rápido de Configuração
              </h4>

              <div className="space-y-3">
                <div className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 font-medium">
                    Clique no botão acima para abrir a pasta local <strong>windows-rpa-agent</strong>.
                  </div>
                </div>

                <div className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 font-medium">
                    Dê dois cliques no arquivo <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px] font-bold text-indigo-600 dark:text-indigo-400">install-agent.bat</code> para configurar as dependências automaticamente.
                  </div>
                </div>

                <div className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 font-medium">
                    Por fim, abra o arquivo <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px] font-bold text-indigo-600 dark:text-indigo-400">run-agent.bat</code>. Ele abrirá o navegador uma única vez para você escanear o <strong>QR Code do seu WhatsApp</strong>.
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/30 p-3 rounded-xl flex items-start gap-2.5 mt-2">
                <AlertCircle className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-[10.5px] leading-relaxed text-indigo-700 dark:text-indigo-300 font-medium">
                  <strong>Nota de Execução:</strong> Após a autenticação inicial, o robô passa a rodar de forma 100% invisível em segundo plano no Windows sempre que o PC for ligado.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Offers Gallery Bank */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-indigo-500" />
                  Banco de Imagens e Ofertas
                </h3>
                <p className="text-xs text-slate-400 font-medium">Produtos cadastrados e textos prontos para disparar</p>
              </div>
              <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg text-xs font-black">
                {offers.length} Ofertas
              </span>
            </div>

            {loadingOffers ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
                <RefreshCw className="w-10 h-10 animate-spin" />
                <p className="font-bold text-sm">Carregando banco de ofertas...</p>
              </div>
            ) : offers.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <Bot className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p className="font-bold text-slate-500">Seu banco de ofertas está vazio.</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">Envie uma imagem e utilize o cérebro da Belinha para gerar campanhas instantâneas!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[550px] overflow-y-auto pr-1 scrollbar-thin">
                {offers.map(offer => (
                  <div key={offer.id} className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-all group">
                    <div className="space-y-3">
                      {/* Card visual elements */}
                      <div className="flex gap-4">
                        <div className="w-20 h-20 rounded-xl overflow-hidden shadow bg-slate-100 dark:bg-slate-900 shrink-0 border border-slate-200/50 dark:border-slate-800">
                          {offer.mediaPath ? (
                            <img src={`${API_BASE}${offer.mediaPath}`} alt={offer.productName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${getCategoryBadge(offer.category)}`}>
                            {offer.category}
                          </span>
                          <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 truncate mt-1.5">{offer.productName}</h4>
                          <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 mt-1">R$ {offer.price.toFixed(2)}</p>
                        </div>
                      </div>

                      {/* AI generated sell text */}
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-3 select-all">
                          {offer.aiCaption}
                        </p>
                      </div>

                      {/* Botão de Envio Imediato para teste */}
                      <button
                        onClick={() => handleSendImmediate(offer)}
                        disabled={sendingImmediateId === offer.id}
                        className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white font-bold rounded-xl text-xs shadow-sm hover:shadow transition-all disabled:opacity-70 cursor-pointer"
                      >
                        {sendingImmediateId === offer.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Disparar Imediato 🚀
                      </button>
                    </div>

                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-[9px] text-slate-400 font-bold">
                        Cadastrado em {new Date(offer.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                      <button
                        onClick={() => handleDeleteOffer(offer.id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors cursor-pointer"
                        title="Deletar oferta"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Orquestrador Inteligente: Clima & IA Scheduler */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 border-b border-slate-100 dark:border-slate-800 pb-6">
          <div className="max-w-xl">
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-2">
              <Bot className="w-6 h-6 text-indigo-500" />
              Planejador Semanal Inteligente
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              O cérebro de marketing analisa as ofertas do banco e o clima de Juiz de Fora para distribuir os disparos de hora em hora (:10) no melhor momento comercial de cada categoria.
            </p>
          </div>

          <button
            onClick={handleGenerateSchedule}
            disabled={generatingSchedule || offers.length === 0}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap self-stretch md:self-auto"
          >
            {generatingSchedule ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {generatingSchedule ? 'Planejando...' : 'Gerar Cronograma Inteligente 🧠'}
          </button>
        </div>

        {/* Current Weather Display */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          
          <div className="md:col-span-1 bg-gradient-to-br from-sky-400 to-blue-600 rounded-2xl p-5 text-white flex flex-col justify-between shadow-lg relative overflow-hidden">
            <div className="absolute -right-6 -top-6 opacity-20 pointer-events-none">
              <CloudRain className="w-32 h-32" />
            </div>
            <div className="relative z-10 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-full">Clima em JF 🌧️</span>
              <p className="text-base font-black leading-tight">{currentWeather}</p>
            </div>
            <span className="text-[10px] font-medium opacity-80 mt-4 block">Bairro Ipiranga, JF/MG</span>
          </div>

          {/* Setup Delivery Group */}
          <div className="md:col-span-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-500" />
                  Grupo Alvo do WhatsApp
                </label>
                <p className="text-xs text-slate-500 font-medium">Selecione o grupo onde o robô irá realizar os anúncios de hora em hora.</p>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-80">
                  <select
                    value={isManualGroup ? 'manual' : selectedGroup}
                    onChange={e => {
                      if (e.target.value === 'manual') {
                        setIsManualGroup(true);
                      } else {
                        setIsManualGroup(false);
                        setSelectedGroup(e.target.value);
                      }
                    }}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 shadow-sm appearance-none cursor-pointer pr-10"
                  >
                    <option value="">Selecione o grupo de ofertas...</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.isCustom ? `⭐ [Salvo] ${g.subject || g.name}` : g.subject || g.name || g.id}
                      </option>
                    ))}
                    <option value="manual">✍️ Digitar Grupo Manualmente...</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>

                {/* Botão de excluir grupo customizado */}
                {selectedGroup && groups.find(g => g.id === selectedGroup)?.isCustom && (
                  <button
                    onClick={() => handleDeleteCustomGroup(selectedGroup)}
                    className="p-3 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl border border-red-200 transition-colors cursor-pointer"
                    title="Excluir grupo salvo"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Formulário expansível para digitação manual */}
            {isManualGroup && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 animate-in slide-in-from-top-4 duration-300">
                <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">✍️ Cadastrar Novo Grupo Customizado</span>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nome do Grupo do WhatsApp (Exatamente como escrito no seu celular)</label>
                  <input
                    type="text"
                    placeholder="Ex: Grupo de Ofertas Bela Farma"
                    value={manualGroupName}
                    onChange={e => setManualGroupName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 shadow-sm"
                  />
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-[10px] text-slate-400 leading-relaxed max-w-md">
                    💡 <strong>Como funciona?</strong> O robô local pesquisará na barra de busca do WhatsApp exatamente pelo nome que você salvou. Não há necessidade de obter IDs complicados!
                  </span>
                  
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsManualGroup(false);
                        setManualGroupName('');
                      }}
                      className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleSaveCustomGroup}
                      disabled={savingCustomGroup}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-70 flex items-center gap-1.5"
                    >
                      {savingCustomGroup ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Salvar Grupo 💾'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Proposed Schedule Preview Grid */}
        {proposedSchedule.length > 0 ? (
          <div className="space-y-6">
            <div className="bg-slate-50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/50 rounded-2xl p-4">
              <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                Escala Proposta pela IA (:10 de cada hora)
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {proposedSchedule.map((slot, index) => (
                  <div key={index} className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-4 rounded-xl shadow-sm flex flex-col justify-between border-l-4 border-l-indigo-500 hover:-translate-y-0.5 transition-transform">
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300 rounded font-black text-[10px] uppercase tracking-wider">
                          🗓️ {slot.day} · {slot.hour.toString().padStart(2, '0')}:10
                        </span>
                        <span className="text-[10px] font-black text-slate-400 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> Slot {index + 1}
                        </span>
                      </div>
                      
                      <div className="flex gap-3 items-center">
                        <div className="w-10 h-10 bg-slate-50 dark:bg-slate-900 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 shrink-0">
                          {slot.mediaPath && <img src={`${API_BASE}${slot.mediaPath}`} className="w-full h-full object-cover" />}
                        </div>
                        <h5 className="text-xs font-black text-slate-800 dark:text-slate-200 line-clamp-1">{slot.productName}</h5>
                      </div>
                      
                      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/50 p-2 rounded line-clamp-3">
                        {slot.content}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-start gap-1">
                      <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                        🎯 {slot.motivoEstrategico}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Confirm Actions */}
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setProposedSchedule([])}
                className="px-5 py-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 rounded-xl font-black text-sm transition-colors cursor-pointer"
              >
                Descartar Escala
              </button>
              
              <button
                onClick={handleConfirmSchedule}
                disabled={confirmingSchedule}
                className="flex items-center justify-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-lg shadow-emerald-500/20 cursor-pointer transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {confirmingSchedule ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CalendarCheck2 className="w-5 h-5 text-amber-300 animate-pulse" />}
                {confirmingSchedule ? 'Salvando...' : 'Confirmar e Enfileirar no Robô 🚀'}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/20">
            <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-bold text-slate-500">Nenhum cronograma ativo.</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">Clique em "Gerar Cronograma Inteligente" para que a IA distribua suas ofertas de hora em hora (:10) de forma totalmente automatizada.</p>
          </div>
        )}

      </div>

    </div>
  );
}
