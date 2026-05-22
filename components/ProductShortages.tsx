import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Filter, Trash2, ClipboardList, 
  MessageCircle, Star, X, Save, User as UserIcon,
  Tag, AlertCircle, Loader2, Sparkles, FileDown, BarChart3,
  Truck, Check, Eye, EyeOff
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { ProductShortage, ProductType, User, UserRole } from '../types';
import { QuotationComparator } from './QuotationComparator';
import { useToast } from './ToastContext';

interface ProductShortagesProps {
  user: User;
  shortages: ProductShortage[];
  onAdd: (shortage: ProductShortage) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, purchased: boolean, ordered: boolean) => void;
  onRefresh?: () => Promise<void>;
}

export const ProductShortages: React.FC<ProductShortagesProps> = ({ user, shortages, onAdd, onDelete, onUpdate, onRefresh }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showComparator, setShowComparator] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [hidePurchased, setHidePurchased] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    productName: '',
    type: ProductType.GENERICO,
    clientInquiry: false,
    notes: ''
  });

  // Estado para busca inteligente no formulário
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [lastSelected, setLastSelected] = useState('');

  const { addToast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [targetPhone, setTargetPhone] = useState('');

  const handleWhatsAppScan = async (deepScan: boolean, phone?: string) => {
    setIsScanModalOpen(false);
    setIsScanning(true);
    if (phone) {
      addToast(`🔍 Iniciando varredura no WhatsApp para o contato ${phone}...`, "info");
    } else {
      addToast("🔍 Iniciando varredura no WhatsApp principal...", "info");
    }
    try {
      const response = await fetch('/api/whatsapp/force-shortage-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          initialScan30Days: deepScan,
          phone: phone || null
        })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        const added = data.stats?.shortagesAdded || 0;
        if (added > 0) {
          addToast(`✅ Varredura concluída! ${added} novo(s) produto(s) em falta identificado(s) e cadastrado(s).`, "success");
        } else {
          addToast("ℹ️ Varredura concluída! Nenhuma nova falta detectada nas conversas.", "info");
        }
        
        if (onRefresh) {
          await onRefresh();
        }
      } else {
        addToast(`❌ Erro na varredura: ${data.error || 'Erro interno'}`, "error");
      }
    } catch (err: any) {
      console.error("Erro ao varrer WhatsApp:", err);
      addToast(`❌ Erro de conexão ao varrer WhatsApp: ${err.message}`, "error");
    } finally {
      setIsScanning(false);
      setTargetPhone(''); // limpa o input após varrer
    }
  };

  useEffect(() => {
    const fetchSuggestions = async () => {
      // Se a query for pequena, ou igual ao que acabamos de selecionar, para.
      if (formData.productName.length < 3 || formData.productName === lastSelected) {
        setSuggestions([]);
        return;
      }
      
      setIsSearchingSuggestions(true);
      // Instantiate GoogleGenAI right before the API call
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Sugira 3 nomes de medicamentos oficiais que começam com: "${formData.productName}". Retorne JSON array de strings.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        });
        setSuggestions(JSON.parse(response.text || '[]'));
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearchingSuggestions(false);
      }
    };

    const timer = setTimeout(fetchSuggestions, 800);
    return () => clearTimeout(timer);
  }, [formData.productName, lastSelected]);

  const filteredShortages = shortages.filter(s => {
    const matchesSearch = s.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || s.type === typeFilter;
    const matchesHidePurchased = !hidePurchased || !s.purchased;
    return matchesSearch && matchesType && matchesHidePurchased;
  });

  const exportToTxt = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const filterLabel = typeFilter === 'all' ? 'Todos os tipos' : typeFilter;
    const searchLabel = searchTerm ? `Busca: "${searchTerm}"` : 'Sem filtro de busca';

    // Para a cotação de fato, filtramos os itens já comprados
    const exportableShortages = filteredShortages.filter(s => !s.purchased);

    const lines: string[] = [
      '================================================',
      `  LISTA DE FALTAS - COTAÇÃO`,
      `  Gerado em: ${dateStr} às ${timeStr}`,
      `  Filtros: ${filterLabel} | ${searchLabel}`,
      `  Total de itens pendentes: ${exportableShortages.length}`,
      '================================================',
      '',
    ];

    // Urgentes primeiro
    const urgent = exportableShortages.filter(s => s.clientInquiry);
    const normal = exportableShortages.filter(s => !s.clientInquiry);

    if (urgent.length > 0) {
      lines.push('⚠  URGENTE (Cliente Aguardando):');
      lines.push('------------------------------------------------');
      urgent.forEach((s, i) => {
        let itemLine = `  ${i + 1}. ${s.productName.toUpperCase()} [${s.type}]`;
        if (s.ordered) itemLine += ' [⚠️ JÁ PEDIDO]';
        lines.push(itemLine);
        if (s.notes) lines.push(`     Obs: ${s.notes}`);
      });
      lines.push('');
    }

    if (normal.length > 0) {
      lines.push('   ITENS PARA COTAÇÃO:');
      lines.push('------------------------------------------------');
      normal.forEach((s, i) => {
        let itemLine = `  ${urgent.length + i + 1}. ${s.productName.toUpperCase()} [${s.type}]`;
        if (s.ordered) itemLine += ' [JÁ PEDIDO]';
        lines.push(itemLine);
        if (s.notes) lines.push(`     Obs: ${s.notes}`);
      });
      lines.push('');
    }

    lines.push('================================================');
    lines.push('  Bela Farma');
    lines.push('================================================');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faltas-cotacao-${now.toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.productName) return;

    onAdd({
      id: Math.random().toString(36).substr(2, 9),
      ...formData,
      createdAt: new Date().toISOString(),
      userName: user.name,
      purchased: false,
      ordered: false
    });

    setFormData({ productName: '', type: ProductType.GENERICO, clientInquiry: false, notes: '' });
    setLastSelected('');
    setIsModalOpen(false);
  };

  const getTypeColor = (type: ProductType) => {
    switch (type) {
      case ProductType.GENERICO: return 'bg-blue-100 text-blue-700';
      case ProductType.SIMILAR: return 'bg-purple-100 text-purple-700';
      case ProductType.PERFUMARIA: return 'bg-emerald-100 text-emerald-700';
      case ProductType.MARCA: return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <>
      {showComparator ? (
        <QuotationComparator onBack={() => setShowComparator(false)} />
      ) : (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lista de Faltas e Procura</h1>
          <p className="text-slate-500 font-medium">Controle de estoque e pedidos perdidos.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowComparator(true)}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg active:scale-95"
          >
            <BarChart3 className="w-5 h-5" /> Comparar Cotações
          </button>
          <button
            onClick={() => setIsScanModalOpen(true)}
            disabled={isScanning}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800/60 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all shadow-lg active:scale-95 whitespace-nowrap"
          >
            {isScanning ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <MessageCircle className="w-5 h-5 fill-white/20 text-white" />
            )}
            {isScanning ? "Varrendo WhatsApp..." : "Varrer WhatsApp"}
          </button>
          <button 
            onClick={() => {
              setFormData({ productName: '', type: ProductType.GENERICO, clientInquiry: false, notes: '' });
              setLastSelected('');
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg active:scale-95"
          >
            <Plus className="w-5 h-5" /> Registrar Falta
          </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar produto em falta..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative w-full md:w-56">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select 
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none outline-none focus:ring-2 focus:ring-red-500"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Todos os Tipos</option>
            {Object.values(ProductType).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setHidePurchased(!hidePurchased)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all shadow active:scale-95 whitespace-nowrap ${
            hidePurchased 
              ? 'bg-slate-700 text-white hover:bg-slate-800' 
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
          }`}
          title={hidePurchased ? "Mostrar itens já comprados" : "Ocular itens já comprados"}
        >
          {hidePurchased ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {hidePurchased ? "Mostrar Comprados" : "Ocultar Comprados"}
        </button>
        <button
          onClick={exportToTxt}
          disabled={filteredShortages.length === 0}
          title={`Exportar ${filteredShortages.length} item(s) para TXT`}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <FileDown className="w-4 h-4" />
          Exportar TXT ({filteredShortages.length})
        </button>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Produto / Item</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Procura de Cliente</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status de Aquisição</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Registrado por</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredShortages.map((s) => (
                <tr 
                  key={s.id} 
                  className={`transition-all duration-300 group ${
                    s.purchased 
                      ? 'bg-slate-100/50 hover:bg-slate-150 opacity-60' 
                      : s.ordered 
                        ? 'bg-blue-50/20 hover:bg-blue-50/40 border-l-4 border-l-blue-500' 
                        : 'hover:bg-red-50/20'
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center">
                        <span className={`font-black uppercase tracking-tighter transition-all ${
                          s.purchased 
                            ? 'text-slate-400 line-through decoration-slate-400 decoration-2' 
                            : 'text-slate-900'
                        }`}>
                          {s.productName}
                        </span>
                        {s.purchased && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 animate-fade-in">
                            Comprado
                          </span>
                        )}
                        {s.ordered && !s.purchased && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 animate-pulse">
                            Pedido
                          </span>
                        )}
                        {s.source === 'WhatsApp' && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            <MessageCircle className="w-2.5 h-2.5 fill-emerald-600/30 text-emerald-600" />
                            WhatsApp
                          </span>
                        )}
                      </div>
                      {s.notes && (
                        <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mt-0.5">
                          <MessageCircle className="w-3 h-3" /> {s.notes}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getTypeColor(s.type)}`}>
                      {s.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      {s.clientInquiry ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 rounded-full border border-amber-100">
                          <Star className="w-3 h-3 fill-amber-600 animate-pulse" />
                          <span className="text-[10px] font-black uppercase">Sim, Urgente</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-black text-slate-300 uppercase">Não</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      {/* Botão Pedido */}
                      <button
                        onClick={() => onUpdate(s.id, !!s.purchased, !s.ordered)}
                        title={s.ordered ? "Remover marcação de Pedido" : "Marcar como Pedido"}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 ${
                          s.ordered
                            ? 'bg-blue-100 text-blue-700 border-blue-200 shadow-sm'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                        }`}
                      >
                        <Truck className={`w-3.5 h-3.5 ${s.ordered ? 'animate-bounce' : ''}`} />
                        Pedido
                      </button>

                      {/* Botão Comprado */}
                      <button
                        onClick={() => onUpdate(s.id, !s.purchased, !!s.ordered)}
                        title={s.purchased ? "Remover marcação de Comprado" : "Marcar como Comprado"}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 ${
                          s.purchased
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        Comprado
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-700 uppercase">{s.userName}</span>
                      <span className="text-[9px] font-bold text-slate-400">{new Date(s.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <button 
                        onClick={() => confirm('Remover este item da lista de faltas?') && onDelete(s.id)}
                        className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredShortages.length === 0 && (
            <div className="py-12 text-center text-slate-400 italic font-bold text-sm">
              Nenhuma falta registrada.
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
              <h2 className="text-xl font-black text-red-700 tracking-tight uppercase">Registrar Falta</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-red-700 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-2 relative">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex justify-between">
                  Nome do Produto* 
                  {isSearchingSuggestions && <Loader2 className="w-3 h-3 animate-spin text-red-500" />}
                </label>
                <div className="relative">
                  <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    required autoFocus
                    type="text"
                    autoComplete="off"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"
                    placeholder="Inicie a digitação..."
                    value={formData.productName}
                    onChange={e => setFormData({...formData, productName: e.target.value})}
                  />
                </div>

                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white shadow-2xl rounded-2xl border border-slate-100 z-[70] mt-1 overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button 
                        key={i} 
                        type="button"
                        onClick={() => {
                          setFormData({...formData, productName: s});
                          setLastSelected(s);
                          setSuggestions([]);
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-red-50 hover:text-red-700 border-b border-slate-50 last:border-none flex items-center gap-2"
                      >
                        <Sparkles className="w-3 h-3 text-red-400" />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Classificação do Produto*</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold appearance-none"
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value as ProductType})}
                >
                  {Object.values(ProductType).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Procura de Cliente?</label>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, clientInquiry: !formData.clientInquiry})}
                  className={`w-full p-4 rounded-2xl border-2 flex items-center justify-center gap-3 transition-all ${
                    formData.clientInquiry 
                      ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-inner' 
                      : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'
                  }`}
                >
                  <Star className={`w-5 h-5 ${formData.clientInquiry ? 'fill-amber-500' : ''}`} />
                  <span className="font-black text-xs uppercase">Sim, o cliente procurou na loja</span>
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações Adicionais</label>
                <textarea 
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-medium resize-none"
                  placeholder="Ex: Cliente aguardando retorno, preço concorrente..."
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-red-200 transition-all active:scale-95"
                >
                  Confirmar Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isScanModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-emerald-50/50">
              <h2 className="text-xl font-black text-emerald-800 tracking-tight uppercase flex items-center gap-2">
                <MessageCircle className="w-6 h-6 fill-emerald-800/20 text-emerald-800" />
                Varredura de WhatsApp
              </h2>
              <button onClick={() => setIsScanModalOpen(false)} className="p-2 text-slate-400 hover:text-emerald-800 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                Escolha o tipo de varredura que deseja realizar nas conversas do WhatsApp principal. A IA analisará as mensagens para detectar produtos solicitados que estavam em falta.
              </p>

              <div className="space-y-4">
                {/* Opção 1: Varredura de Rotina */}
                <button
                  onClick={() => handleWhatsAppScan(false)}
                  className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-emerald-50/20 hover:border-emerald-200 text-left transition-all active:scale-[0.98] group"
                >
                  <span className="block font-black text-sm text-slate-800 group-hover:text-emerald-700 uppercase">Varredura de Rotina (Recomendado)</span>
                  <span className="block text-xs font-medium text-slate-400 mt-1">Busca conversas ativas recentemente. Rápido e ideal para o dia a dia.</span>
                </button>

                {/* Opção 2: Varredura Histórica */}
                <button
                  onClick={() => handleWhatsAppScan(true)}
                  className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-amber-50/20 hover:border-amber-200 text-left transition-all active:scale-[0.98] group"
                >
                  <span className="block font-black text-sm text-amber-700 uppercase flex items-center gap-1.5">
                    <Star className="w-4 h-4 fill-amber-500 text-amber-500" /> Varredura Histórica (30 Dias)
                  </span>
                  <span className="block text-xs font-medium text-slate-400 mt-1">Faz um mapeamento profundo das conversas de até 30 dias atrás (limitado aos 100 contatos mais ativos). Pode demorar mais tempo.</span>
                </button>

                {/* Opção 3: Varredura de Contato Específico */}
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Varrer conversa específica por número</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium focus:ring-2 focus:ring-emerald-500 text-sm"
                      placeholder="DDD + Telefone (ex: 32988634711)"
                      value={targetPhone}
                      onChange={e => setTargetPhone(e.target.value)}
                    />
                    <button
                      onClick={() => {
                        if (!targetPhone) return;
                        handleWhatsAppScan(false, targetPhone);
                      }}
                      disabled={!targetPhone}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-2xl font-black transition-all text-xs uppercase tracking-widest whitespace-nowrap active:scale-95 shadow-md shadow-emerald-100"
                    >
                      Varrer Número
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsScanModalOpen(false)}
                  className="px-6 py-2.5 border border-slate-200 text-slate-500 font-bold rounded-xl hover:bg-slate-50 transition-all active:scale-95 uppercase tracking-wider text-xs"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
      )}
    </>
  );
};
