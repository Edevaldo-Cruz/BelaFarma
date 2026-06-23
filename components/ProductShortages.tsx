import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Filter, Trash2, ClipboardList, 
  MessageCircle, Star, X, Save, User as UserIcon,
  Tag, AlertCircle, Loader2, Sparkles, FileDown, BarChart3,
  Truck, Check, Eye, EyeOff, AlertTriangle, RefreshCw, Users,
  Send
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
  const [mainTab, setMainTab] = useState<'faltas' | 'atencao'>('faltas');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hidePurchased, setHidePurchased] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [clientInquiryFilter, setClientInquiryFilter] = useState<'all' | 'urgent' | 'normal'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'ordered' | 'purchased'>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'urgent_first' | 'status_pending' | 'alpha_asc' | 'alpha_desc'>('date_desc');
  const [formData, setFormData] = useState({
    productName: '',
    type: ProductType.GENERICO,
    clientInquiry: false,
    notes: ''
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [quoteStep, setQuoteStep] = useState<'selecting' | 'loading' | 'reviewing'>('selecting');
  const [quoteText, setQuoteText] = useState('');
  const [quoteSuppliers, setQuoteSuppliers] = useState<any[]>([]);

  // Estado para busca inteligente no formulário
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [lastSelected, setLastSelected] = useState('');

  // Estado para armazenar o saldo e última compra das faltas vindos do Digifarma
  const [dbStatuses, setDbStatuses] = useState<Record<string, { saldo: number, priceCompra: number }>>({});
  const [isLoadingDbStatuses, setIsLoadingDbStatuses] = useState(false);

  // Histórico de Compras
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Listas de Cotação
  const [isListsModalOpen, setIsListsModalOpen] = useState(false);
  const [quotationLists, setQuotationLists] = useState<any[]>([]);
  const [isListsLoading, setIsListsLoading] = useState(false);
  const [newListName, setNewListName] = useState('');
  
  const [isAddToListModalOpen, setIsAddToListModalOpen] = useState(false);

  const { addToast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [targetPhone, setTargetPhone] = useState('');
  const [isExporting, setIsExporting] = useState(false);

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

  const fetchDbStatuses = async (items: ProductShortage[]) => {
    if (!items || items.length === 0) {
      setDbStatuses({});
      return;
    }
    
    // Get all unique product names
    const names = Array.from(new Set(items.map(s => s.productName).filter(Boolean)));
    if (names.length === 0) return;
    
    setIsLoadingDbStatuses(true);
    try {
      const response = await fetch('/api/shortages/db-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ productNames: names })
      });
      if (response.ok) {
        const data = await response.json();
        setDbStatuses(data || {});
      }
    } catch (err) {
      console.error('Erro ao buscar saldos e compras no Digifarma:', err);
    } finally {
      setIsLoadingDbStatuses(false);
    }
  };

  useEffect(() => {
    fetchDbStatuses(shortages);
  }, [shortages]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      // Se a query for pequena, ou igual ao que acabamos de selecionar, para.
      if (formData.productName.length < 3 || formData.productName === lastSelected) {
        setSuggestions([]);
        return;
      }
      
      setIsSearchingSuggestions(true);
      try {
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(formData.productName)}`);
        const data = await response.json();
        setSuggestions(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearchingSuggestions(false);
      }
    };

    const timer = setTimeout(fetchSuggestions, 400);
    return () => clearTimeout(timer);
  }, [formData.productName, lastSelected]);

  const filteredShortages = shortages.filter(s => {
    const isAttention = s.notes && (s.notes.includes('Atenção: Resta 1') || s.notes.includes('[ATENÇÃO: RESTA 1'));
    if (mainTab === 'faltas' && isAttention) return false;
    if (mainTab === 'atencao' && !isAttention) return false;

    const matchesSearch = s.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || s.type === typeFilter;
    const matchesHidePurchased = !hidePurchased || !s.purchased;
    
    const matchesClientInquiry = clientInquiryFilter === 'all' 
      ? true 
      : clientInquiryFilter === 'urgent' ? s.clientInquiry : !s.clientInquiry;
      
    const matchesStatus = statusFilter === 'all' 
      ? true 
      : statusFilter === 'pending' ? (!s.purchased && !s.ordered)
      : statusFilter === 'ordered' ? (s.ordered && !s.purchased)
      : statusFilter === 'purchased' ? s.purchased : true;

    return matchesSearch && matchesType && matchesHidePurchased && matchesClientInquiry && matchesStatus;
  }).sort((a, b) => {
    if (sortBy === 'date_desc') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === 'date_asc') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (sortBy === 'alpha_asc') {
      return a.productName.localeCompare(b.productName);
    }
    if (sortBy === 'alpha_desc') {
      return b.productName.localeCompare(a.productName);
    }
    if (sortBy === 'urgent_first') {
      if (a.clientInquiry === b.clientInquiry) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return a.clientInquiry ? -1 : 1;
    }
    if (sortBy === 'status_pending') {
      // Pendente -> Pedido -> Comprado
      const getStatusWeight = (item: any) => item.purchased ? 3 : item.ordered ? 2 : 1;
      const weightA = getStatusWeight(a);
      const weightB = getStatusWeight(b);
      if (weightA === weightB) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return weightA - weightB;
    }
    return 0;
  });

  const exportToTxt = async () => {
    const exportableShortages = filteredShortages.filter(s => selectedIds.includes(s.id));
    if (exportableShortages.length === 0) {
      addToast("Nenhum item selecionado para exportação.", "warning");
      return;
    }

    setIsExporting(true);
    try {
      const selectedProductsNames = Array.from(new Set(exportableShortages.map(s => s.productName)));
      let suppliersData: any[] = [];
      
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      try {
        const resSuppliers = await fetch(`${API_BASE}/api/purchasing/quotes/last-suppliers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products: selectedProductsNames })
        });
        if (resSuppliers.ok) {
          suppliersData = await resSuppliers.json();
        }
      } catch (err) {
        console.error("Erro ao buscar fornecedores:", err);
      }

      // Build a map of ProductName -> SupplierName
      const productToSupplier = new Map<string, string>();
      suppliersData.forEach((s: any) => {
        // As the query orders by COMPRA_DATA DESC, the first one encountered is the most recent
        if (!productToSupplier.has(s.PRODUTO_ID)) {
          productToSupplier.set(s.PRODUTO_ID, s.FORNECEDOR);
        }
      });

      // Group products by Type -> Supplier -> Products
      const groupedByType: Record<string, Record<string, ProductShortage[]>> = {};

      exportableShortages.forEach(s => {
        const type = s.type || 'Outros';
        const supplier = productToSupplier.get(s.productName) || 'SEM FORNECEDOR / OUTROS';
        
        if (!groupedByType[type]) groupedByType[type] = {};
        if (!groupedByType[type][supplier]) groupedByType[type][supplier] = [];
        
        groupedByType[type][supplier].push(s);
      });

      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR');
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const lines: string[] = [
        '================================================',
        `  COTAÇÃO GERAL`,
        `  Gerado em: ${dateStr} às ${timeStr}`,
        '================================================',
        '',
      ];

      const sortedTypes = Object.keys(groupedByType).sort();

      // Generate one file with all Types
      for (const type of sortedTypes) {
        lines.push(`▶ TIPO: ${type.toUpperCase()}`);
        lines.push('================================================');

        const suppliersObj = groupedByType[type];
        
        // Sort suppliers alphabetically, put 'SEM FORNECEDOR / OUTROS' at the end
        const sortedSuppliers = Object.keys(suppliersObj).sort((a, b) => {
          if (a === 'SEM FORNECEDOR / OUTROS') return 1;
          if (b === 'SEM FORNECEDOR / OUTROS') return -1;
          return a.localeCompare(b);
        });

        for (const supplier of sortedSuppliers) {
          lines.push(`  📦 FORNECEDOR: ${supplier}`);
          lines.push('  ----------------------------------------------');
          
          const products = suppliersObj[supplier];
          products.forEach((s, i) => {
            let itemLine = `     ${i + 1}. ${s.productName.toUpperCase()}`;
            if (s.clientInquiry) itemLine += ' *';
            if (s.ordered) itemLine += ' [JÁ PEDIDO]';
            lines.push(itemLine);
            if (s.notes) lines.push(`        Obs: ${s.notes}`);
          });
          lines.push('');
        }
        lines.push('');
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cotacao-geral-${now.toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addToast("Exportação concluída com sucesso!", "success");
    } catch (err) {
      console.error(err);
      addToast("Erro ao exportar arquivo TXT.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const toggleSelectAll = () => {
    const exportable = filteredShortages.filter(s => !s.purchased);
    if (selectedIds.length === exportable.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(exportable.map(s => s.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleOpenQuotation = async () => {
    if (selectedIds.length === 0) return;
    setIsQuoteModalOpen(true);
    setQuoteStep('loading');

    const selectedProducts = filteredShortages.filter(s => selectedIds.includes(s.id)).map(s => s.productName);

    try {
      // Buscar últimos fornecedores
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      const resSuppliers = await fetch(`${API_BASE}/api/purchasing/quotes/last-suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: selectedProducts })
      });
      const suppliersData = await resSuppliers.json();
      
      // Agrupar e pegar os fornecedores únicos mais recentes
      const uniqueSuppliers = new Map();
      suppliersData.forEach((s: any) => {
        if (!uniqueSuppliers.has(s.FORNECEDOR_ID)) {
          uniqueSuppliers.set(s.FORNECEDOR_ID, s);
        }
      });
      const suppliersList = Array.from(uniqueSuppliers.values()).slice(0, 5); // Limita a 5 fornecedores
      setQuoteSuppliers(suppliersList);

      if (suppliersList.length > 0) {
        // Gerar texto
        const resText = await fetch(`${API_BASE}/api/purchasing/quotes/generate-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: selectedProducts, supplierName: suppliersList[0]?.FORNECEDOR || 'Fornecedor' })
        });
        const textData = await resText.json();
        setQuoteText(textData.text || '');
      }
      setQuoteStep('reviewing');
    } catch (err) {
      console.error(err);
      addToast("Erro ao carregar dados da cotação", "error");
      setIsQuoteModalOpen(false);
    }
  };

  const loadHistory = async (product: any) => {
    setHistoryProduct(product);
    setIsHistoryModalOpen(true);
    setIsHistoryLoading(true);
    try {
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      const res = await fetch(`${API_BASE}/api/purchasing/product/${encodeURIComponent(product.id)}/history?productName=${encodeURIComponent(product.productName)}`);
      const data = await res.json();
      setHistoryData(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast('Erro ao carregar histórico', 'error');
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const loadLists = async () => {
    setIsListsLoading(true);
    try {
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      const res = await fetch(`${API_BASE}/api/purchasing/quotes/lists`);
      const data = await res.json();
      setQuotationLists(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast('Erro ao carregar listas', 'error');
    } finally {
      setIsListsLoading(false);
    }
  };

  const createList = async () => {
    if (!newListName.trim()) return;
    try {
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      await fetch(`${API_BASE}/api/purchasing/quotes/lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newListName })
      });
      setNewListName('');
      loadLists();
      addToast('Lista criada com sucesso!', 'success');
    } catch (err) {
      addToast('Erro ao criar lista', 'error');
    }
  };

  const addSelectedToList = async (listId: string) => {
    const selectedProducts = filteredShortages.filter(s => selectedIds.includes(s.id)).map(s => ({
      productId: s.id,
      productName: s.productName
    }));
    try {
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      await fetch(`${API_BASE}/api/purchasing/quotes/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: selectedProducts })
      });
      setIsAddToListModalOpen(false);
      setSelectedIds([]);
      addToast('Itens adicionados à lista com sucesso!', 'success');
      loadLists();
    } catch (err) {
      addToast('Erro ao adicionar itens', 'error');
    }
  };

  const deleteList = async (listId: string) => {
    if(!window.confirm('Excluir esta lista de cotação?')) return;
    try {
      const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      await fetch(`${API_BASE}/api/purchasing/quotes/lists/${listId}`, { method: 'DELETE' });
      loadLists();
      addToast('Lista excluída!', 'success');
    } catch (err) {
      addToast('Erro ao excluir lista', 'error');
    }
  };

  const handleSendQuotation = async (supplierId: string, supplierName: string) => {
    const selectedProducts = filteredShortages.filter(s => selectedIds.includes(s.id)).map(s => s.productName);
    const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

    try {
      const res = await fetch(`${API_BASE}/api/purchasing/quotes/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierDigifarmaId: supplierId,
          supplierName: supplierName,
          message: quoteText,
          products: selectedProducts
        })
      });

      const data = await res.json();
      if (data.success) {
        addToast(`Cotação enviada para ${supplierName}!`, "success");
      } else {
        addToast(`Erro: ${data.error}`, "error");
      }
    } catch (err) {
      console.error(err);
      addToast("Erro de conexão ao enviar cotação.", "error");
    }
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
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Lista de Faltas e Procura</h1>
            <p className="text-sm text-slate-500 font-medium">Controle de estoque e pedidos perdidos.</p>
          </div>
          {/* Botão de Registrar Falta ao lado do título no mobile para economizar espaço */}
          <button 
            onClick={() => {
              setFormData({ productName: '', type: ProductType.GENERICO, clientInquiry: false, notes: '' });
              setLastSelected('');
              setIsModalOpen(true);
            }}
            className="md:hidden flex items-center justify-center p-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg active:scale-95 min-h-[44px] min-w-[44px]"
            title="Registrar Falta"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        {/* Botões de Ação do Header - Scroll horizontal no mobile */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button 
            onClick={() => {
              setFormData({ productName: '', type: ProductType.GENERICO, clientInquiry: false, notes: '' });
              setLastSelected('');
              setIsModalOpen(true);
            }}
            className="hidden md:flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg active:scale-95 whitespace-nowrap min-h-[44px] shrink-0 text-sm"
          >
            <Plus className="w-4 h-4" /> Registrar Falta
          </button>
          <button
            onClick={() => setShowComparator(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg active:scale-95 whitespace-nowrap min-h-[44px] shrink-0 text-sm"
          >
            <BarChart3 className="w-4 h-4" /> <span className="hidden sm:inline">Comparar</span> Cotações
          </button>
          <button
            onClick={() => setIsScanModalOpen(true)}
            disabled={isScanning}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800/60 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all shadow-lg active:scale-95 whitespace-nowrap min-h-[44px] shrink-0 text-sm"
          >
            {isScanning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageCircle className="w-4 h-4 fill-white/20 text-white" />
            )}
            {isScanning ? "Varrendo..." : "Varrer WhatsApp"}
          </button>
          <button 
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95 whitespace-nowrap min-h-[44px] shrink-0 text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex w-full md:w-fit bg-white rounded-2xl p-1 shadow-sm border border-slate-100">
        <button
          onClick={() => { setMainTab('faltas'); setSelectedIds([]); }}
          className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 rounded-xl font-bold transition-all text-sm ${
            mainTab === 'faltas' 
              ? 'bg-slate-900 text-white shadow-md' 
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Faltas (Zerados)
        </button>
        <button
          onClick={() => { setMainTab('atencao'); setSelectedIds([]); }}
          className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 rounded-xl font-bold transition-all text-sm ${
            mainTab === 'atencao' 
              ? 'bg-amber-500 text-white shadow-md' 
              : 'text-slate-500 hover:text-amber-600 hover:bg-amber-50'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Atenção (Baixo Estoque)
        </button>
      </div>

      <div className="flex flex-col gap-3 md:gap-4 bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3 w-full">
          {/* Linha da Busca + Botão Filtro Mobile */}
          <div className="flex items-center gap-2 w-full md:flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar produto em falta..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-sm font-medium outline-none focus:ring-2 focus:ring-red-500 input-no-zoom"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="md:hidden flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 min-h-[44px]"
            >
              <Filter className={`w-4 h-4 ${filtersOpen ? 'text-red-650' : 'text-slate-400'}`} />
              Filtros
            </button>
          </div>

          {/* Demais Filtros colapsáveis */}
          <div className={`grid grid-cols-2 md:flex md:flex-row gap-3 items-center w-full md:w-auto transition-all duration-300 overflow-hidden ${filtersOpen ? 'max-h-[500px]' : 'max-h-0 md:max-h-none'} md:block`}>
            <div className="relative col-span-2 md:col-span-1">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select 
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-sm font-bold appearance-none outline-none focus:ring-2 focus:ring-red-500 input-no-zoom"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">Todas Categorias</option>
                {Object.values(ProductType).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="relative col-span-2 md:col-span-1">
              <Star className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select 
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-sm font-bold appearance-none outline-none focus:ring-2 focus:ring-amber-500 input-no-zoom"
                value={clientInquiryFilter}
                onChange={(e) => setClientInquiryFilter(e.target.value as any)}
              >
                <option value="all">Todas Procuras</option>
                <option value="urgent">Apenas Urgentes</option>
                <option value="normal">Não Urgentes</option>
              </select>
            </div>
            <div className="relative col-span-2 md:col-span-1">
              <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select 
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-sm font-bold appearance-none outline-none focus:ring-2 focus:ring-blue-500 input-no-zoom"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="all">Todos os Status</option>
                <option value="pending">Apenas Pendentes</option>
                <option value="ordered">Apenas Pedidos</option>
                <option value="purchased">Apenas Comprados</option>
              </select>
            </div>
            <div className="relative col-span-2 md:col-span-1">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select 
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base md:text-sm font-bold appearance-none outline-none focus:ring-2 focus:ring-slate-500 input-no-zoom"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="date_desc">Mais Recentes</option>
                <option value="date_asc">Mais Antigos</option>
                <option value="urgent_first">Urgência Primeiro</option>
                <option value="status_pending">Pendentes Primeiro</option>
                <option value="alpha_asc">A-Z</option>
                <option value="alpha_desc">Z-A</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 w-full flex-nowrap shrink-0">
          <button
            onClick={() => setHidePurchased(!hidePurchased)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all shadow active:scale-95 whitespace-nowrap min-h-[44px] text-sm shrink-0 ${
              hidePurchased 
                ? 'bg-slate-700 text-white hover:bg-slate-800' 
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
            title={hidePurchased ? "Mostrar itens já comprados" : "Ocultar itens já comprados"}
          >
            {hidePurchased ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {hidePurchased ? "Mostrar Comprados" : "Ocultar Comprados"}
          </button>
          <button
            onClick={handleOpenQuotation}
            disabled={selectedIds.length === 0}
            title={`Cotar ${selectedIds.length} item(s) selecionado(s)`}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap min-h-[44px] text-sm shrink-0"
          >
            <Users className="w-4 h-4" />
            Cotar ({selectedIds.length})
          </button>
          <button
            onClick={() => {
              loadLists();
              setIsListsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow active:scale-95 whitespace-nowrap min-h-[44px] text-sm shrink-0"
          >
            <ClipboardList className="w-4 h-4" />
            Minhas Listas
          </button>
          <button
            onClick={() => {
              loadLists();
              setIsAddToListModalOpen(true);
            }}
            disabled={selectedIds.length === 0}
            title={`Adicionar ${selectedIds.length} item(s) selecionado(s) à uma lista`}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-all shadow active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap min-h-[44px] text-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            + Lista
          </button>
          <button
            onClick={exportToTxt}
            disabled={selectedIds.length === 0 || isExporting}
            title={`Exportar ${selectedIds.length} item(s) selecionado(s) para TXT`}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap min-h-[44px] text-sm shrink-0"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {isExporting ? "Gerando..." : `Exportar TXT (${selectedIds.length})`}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        {/* Indicador de scroll horizontal - só aparece no mobile */}
        <div className="scroll-hint md:hidden py-2 text-slate-400">
          ← Role para ver mais colunas →
        </div>
        <div className="overflow-x-auto mobile-table-container max-h-[650px] overflow-y-auto">
          <table className="w-full text-left border-collapse responsive-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <th className="px-6 py-4 text-center w-12 bg-slate-50">
                  <input 
                    type="checkbox" 
                    onChange={toggleSelectAll}
                    checked={selectedIds.length > 0 && selectedIds.length === filteredShortages.filter(s => !s.purchased).length}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">Produto / Item</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 text-center">Saldo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 text-right">Última Compra</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">Tipo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 text-center">Procura de Cliente</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 text-center">Status de Aquisição</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">Registrado por</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredShortages.map((s) => {
                const status = dbStatuses[s.productName.trim().toUpperCase()];
                return (
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
                    <td className="px-4 md:px-6 py-3 md:py-4 text-center" data-label="Selecionar">
                      {!s.purchased && (
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(s.id)}
                          onChange={() => toggleSelect(s.id)}
                          className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      )}
                    </td>
                    <td className="px-6 py-4" data-label="Produto / Item">
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
                          <span className={`text-[10px] font-bold flex items-center gap-1 mt-0.5 ${s.notes.includes('Atenção: Resta 1') ? 'text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-flex w-fit' : 'text-slate-400'}`}>
                            {s.notes.includes('Atenção: Resta 1') ? <AlertTriangle className="w-3 h-3" /> : <MessageCircle className="w-3 h-3" />} {s.notes}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center" data-label="Saldo">
                      {status ? (
                        <span className={`font-black text-xs ${status.saldo <= 0 ? 'text-red-500 bg-red-50 px-2 py-1 rounded-lg border border-red-100 font-extrabold' : 'text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 font-extrabold'}`}>
                          {status.saldo}
                        </span>
                      ) : isLoadingDbStatuses ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-300 mx-auto" />
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200" title="Produto novo ou não encontrado no banco de dados">
                          Novo / ND
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right" data-label="Última Compra">
                      {status && status.priceCompra > 0 ? (
                        <span className="font-extrabold text-slate-700 text-xs bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(status.priceCompra)}
                        </span>
                      ) : isLoadingDbStatuses ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-300 ml-auto" />
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                          -
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4" data-label="Tipo">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getTypeColor(s.type)}`}>
                        {s.type}
                      </span>
                    </td>
                  <td className="px-6 py-4" data-label="Procura de Cliente">
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
                  <td className="px-4 md:px-6 py-3 md:py-4" data-label="Status de Aquisição">
                    <div className="flex items-center justify-center gap-2">
                      {/* Botão Pedido */}
                      <button
                        onClick={() => onUpdate(s.id, !!s.purchased, !s.ordered)}
                        title={s.ordered ? "Remover marcação de Pedido" : "Marcar como Pedido"}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 min-h-[44px] ${
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
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 min-h-[44px] ${
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
                  <td className="px-6 py-4" data-label="Registrado por">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-700 uppercase">{s.userName}</span>
                      <span className="text-[9px] font-bold text-slate-400">{new Date(s.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4" data-label="Ações">
                    <div className="flex justify-center">
                      <button 
                        onClick={() => loadHistory(s)}
                        title="Ver Últimas Compras"
                        className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <BarChart3 className="w-4.5 h-4.5" />
                      </button>
                      <button 
                        onClick={() => confirm('Remover este item da lista de faltas?') && onDelete(s.id)}
                        className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
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
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full md:max-w-md rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-200 border border-slate-100 flex flex-col max-h-[92dvh]">
            <div className="px-6 md:px-8 py-5 md:py-6 border-b border-slate-100 flex items-center justify-between bg-red-50/50 shrink-0">
              <h2 className="text-lg md:text-xl font-black text-red-700 tracking-tight uppercase">Registrar Falta</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-red-700 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-5 overflow-y-auto flex-1">
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
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-base md:text-sm input-no-zoom"
                    placeholder="Inicie a digitação..."
                    value={formData.productName}
                    onChange={e => setFormData({...formData, productName: e.target.value})}
                  />
                </div>

                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white shadow-2xl rounded-2xl border border-slate-100 z-[70] mt-1 overflow-hidden max-h-60 overflow-y-auto">
                    {suggestions.map((s, i) => (
                      <button 
                        key={i} 
                        type="button"
                        onClick={() => {
                          const fullName = s.presentation ? `${s.name} ${s.presentation}` : s.name;
                          // Classificação automática do Tipo do produto com base na categoria
                          let autoType = ProductType.GENERICO;
                          const cat = (s.categoryName || '').toUpperCase();
                          if (cat.includes('GENERICO') || cat.includes('GENÉRICO')) {
                            autoType = ProductType.GENERICO;
                          } else if (cat.includes('SIMILAR')) {
                            autoType = ProductType.SIMILAR;
                          } else if (cat.includes('PERFUMARIA') || cat.includes('COSMETICO') || cat.includes('HIGIENE') || cat.includes('BELEZA') || cat.includes('DIVERSOS') || cat.includes('CORPO') || cat.includes('CABELO') || cat.includes('FRALDA') || cat.includes('PERFUME')) {
                            autoType = ProductType.PERFUMARIA;
                          } else if (cat.includes('ETICO') || cat.includes('ÉTICO') || cat.includes('REFERENCIA') || cat.includes('REFERÊNCIA')) {
                            autoType = ProductType.MARCA;
                          }

                          setFormData({
                            ...formData, 
                            productName: fullName,
                            type: autoType
                          });
                          setLastSelected(fullName);
                          setSuggestions([]);
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-red-50 hover:text-red-700 border-b border-slate-50 last:border-none flex items-center justify-between gap-2"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Sparkles className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span className="truncate">{s.name} {s.presentation && <span className="text-[10px] text-slate-400 font-normal">({s.presentation})</span>}</span>
                        </span>
                        <span className={`text-[10px] font-black shrink-0 ${s.saldo <= 0 ? 'text-red-600 bg-red-50/50 px-1.5 py-0.5 rounded' : 'text-emerald-600 bg-emerald-50/50 px-1.5 py-0.5 rounded'}`}>
                          Saldo: {s.saldo}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Classificação do Produto*</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold appearance-none text-base md:text-sm input-no-zoom"
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
                <button
                  onClick={() => handleWhatsAppScan(false)}
                  className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-emerald-50/20 hover:border-emerald-200 text-left transition-all active:scale-[0.98] group"
                >
                  <span className="block font-black text-sm text-slate-800 group-hover:text-emerald-700 uppercase">Varredura de Rotina (Recomendado)</span>
                  <span className="block text-xs font-medium text-slate-400 mt-1">Busca conversas ativas recentemente. Rápido e ideal para o dia a dia.</span>
                </button>

                <button
                  onClick={() => handleWhatsAppScan(true)}
                  className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-amber-50/20 hover:border-amber-200 text-left transition-all active:scale-[0.98] group"
                >
                  <span className="block font-black text-sm text-amber-700 uppercase flex items-center gap-1.5">
                    <Star className="w-4 h-4 fill-amber-500 text-amber-500" /> Varredura Histórica (30 Dias)
                  </span>
                  <span className="block text-xs font-medium text-slate-400 mt-1">Faz um mapeamento profundo das conversas de até 30 dias atrás (limitado aos 100 contatos mais ativos). Pode demorar mais tempo.</span>
                </button>

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

      {/* Modal de Cotação */}
      {isQuoteModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-blue-50/50">
              <div>
                <h2 className="text-xl font-black text-blue-800 tracking-tight uppercase flex items-center gap-2">
                  <MessageCircle className="w-6 h-6 fill-blue-800/20 text-blue-800" />
                  Cotar Produtos ({selectedIds.length})
                </h2>
              </div>
              <button onClick={() => setIsQuoteModalOpen(false)} className="p-2 text-slate-400 hover:text-blue-800 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 space-y-6">
              {quoteStep === 'loading' ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="font-bold">Analisando histórico no Digifarma e gerando texto com IA...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Fornecedores Encontrados</h3>
                    {quoteSuppliers.length === 0 ? (
                      <p className="text-sm text-amber-600 bg-amber-50 p-4 rounded-xl border border-amber-200">Nenhum fornecedor encontrado no histórico de compras para estes itens. Certifique-se de que eles já foram comprados antes.</p>
                    ) : (
                      <div className="grid gap-2">
                        {quoteSuppliers.map((s, idx) => (
                          <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl">
                            <div>
                              <span className="block font-bold text-slate-800">{s.FORNECEDOR}</span>
                              <span className="block text-xs font-mono text-slate-400">ID: {s.FORNECEDOR_ID}</span>
                            </div>
                            <button
                              onClick={() => handleSendQuotation(s.FORNECEDOR_ID, s.FORNECEDOR)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-md shadow-blue-500/20"
                            >
                              <Send className="w-3.5 h-3.5" /> Enviar Cotação
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" /> Texto Gerado pela IA
                    </h3>
                    <textarea
                      value={quoteText}
                      onChange={(e) => setQuoteText(e.target.value)}
                      className="w-full h-48 p-4 bg-amber-50/50 border border-amber-200/50 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 text-sm text-slate-700 leading-relaxed resize-none"
                    />
                    <p className="text-xs text-slate-400 font-medium">Você pode editar este texto antes de clicar em "Enviar Cotação". A IA formatou com base nos itens selecionados.</p>
                  </div>
                </>
              )}
            </div>
            
            {quoteStep !== 'loading' && (
              <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setIsQuoteModalOpen(false)}
                  className="px-6 py-2.5 bg-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-300 transition-all"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Modal Historico de Compras */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-3xl bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-slide-up">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                <BarChart3 className="w-7 h-7 text-blue-500" /> Histórico de Compras: <span className="text-blue-600">{historyProduct?.productName}</span>
              </h2>
              <button 
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 max-h-[60vh] overflow-y-auto">
              {isHistoryLoading ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                  <p className="text-slate-500 font-medium">Buscando histórico no Digifarma...</p>
                </div>
              ) : historyData.length === 0 ? (
                <div className="text-center py-10 text-slate-500 font-medium bg-slate-50 rounded-2xl border border-slate-100">
                  Nenhum histórico de compra recente encontrado.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse responsive-table">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold">
                        <th className="p-4 border-b border-slate-200">Data</th>
                        <th className="p-4 border-b border-slate-200">Fornecedor</th>
                        <th className="p-4 border-b border-slate-200">NF</th>
                        <th className="p-4 border-b border-slate-200 text-right">Qtd</th>
                        <th className="p-4 border-b border-slate-200 text-right">Preço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.map((h, i) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-4 text-sm font-bold text-slate-700" data-label="Data">{new Date(h.dataCompra).toLocaleDateString('pt-BR')}</td>
                          <td className="p-4 text-sm font-bold text-slate-900" data-label="Fornecedor">{h.fornecedor}</td>
                          <td className="p-4 text-sm text-slate-500" data-label="NF">{h.notaFiscal}</td>
                          <td className="p-4 text-sm font-bold text-slate-700 text-right" data-label="Qtd">{h.quantidade}</td>
                          <td className="p-4 text-sm font-black text-emerald-600 text-right" data-label="Preço">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(h.precoCompra)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Minhas Listas */}
      {isListsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-slide-up flex flex-col h-[80vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                <ClipboardList className="w-7 h-7 text-indigo-500" /> Minhas Listas de Cotação
              </h2>
              <button 
                onClick={() => setIsListsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto bg-slate-50/30">
              <div className="flex gap-4 mb-8 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <input 
                  type="text" 
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  placeholder="Nome da nova lista (Ex: Pedidos de Sexta)..."
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button 
                  onClick={createList}
                  className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" /> Criar Lista
                </button>
              </div>

              {isListsLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
              ) : quotationLists.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-medium">Nenhuma lista criada.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {quotationLists.map(list => (
                    <div key={list.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative group">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-black text-lg text-slate-800">{list.name}</h3>
                          <p className="text-xs text-slate-400 font-medium">Criada em: {new Date(list.createdAt).toLocaleDateString('pt-BR')}</p>
                        </div>
                        <button 
                          onClick={() => deleteList(list.id)}
                          className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="space-y-2 mb-4 max-h-40 overflow-y-auto pr-2">
                        {list.items && list.items.length > 0 ? (
                          list.items.map((item: any, i: number) => (
                            <div key={i} className="text-sm font-bold text-slate-600 flex justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                              <span>{item.productName}</span>
                              <span className="text-slate-400 text-xs">Qtd: {item.quantity}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-slate-400 italic py-2">Lista vazia. Adicione itens pela tela principal.</div>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setIsListsModalOpen(false);
                          // Para cotar a partir da lista, copiamos os itens para a seleção e abrimos modal de cotação
                          const itemNames = list.items?.map((i: any) => i.productName) || [];
                          // Aqui adaptamos o handleOpenQuotation passando manualmente. Mas como handleOpenQuotation usa selectedIds,
                          // a melhor forma seria talvez fazer um fetch separado para cotar esses itens, ou só deixar eles selecionados.
                          addToast('Para cotar, feche e selecione os itens desejados.', 'info');
                        }}
                        className="w-full py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all border border-slate-200"
                      >
                        Cotar Itens Desta Lista
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Adicionar à Lista */}
      {isAddToListModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-slide-up">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                <Plus className="w-6 h-6 text-violet-500" /> Adicionar à Lista
              </h2>
              <button 
                onClick={() => setIsAddToListModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-slate-500 font-medium mb-4">Escolha uma lista para adicionar os {selectedIds.length} itens selecionados:</p>
              
              {isListsLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
              ) : quotationLists.length === 0 ? (
                <div className="text-center py-4 text-slate-400 font-medium">Nenhuma lista encontrada.</div>
              ) : (
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {quotationLists.map(list => (
                    <button
                      key={list.id}
                      onClick={() => addSelectedToList(list.id)}
                      className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-violet-50 border border-slate-200 hover:border-violet-300 rounded-xl font-bold text-slate-700 hover:text-violet-700 transition-all flex justify-between items-center group"
                    >
                      {list.name}
                      <span className="text-xs text-slate-400 group-hover:text-violet-500">{list.items?.length || 0} itens</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
      )}
    </>
  );
};
