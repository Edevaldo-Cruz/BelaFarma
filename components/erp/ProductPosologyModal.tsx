import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import {
  Pill,
  X,
  Search,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Edit3,
  CheckCircle2,
  Plus,
  MessageSquare,
  ArrowLeft,
  Info,
  Thermometer,
  Package,
  Clock
} from 'lucide-react';
import { useToast } from '../ToastContext';

export interface PosologyProductRef {
  code: string;
  barcode?: string;
  name: string;
}

export interface ProductPosologyRecord {
  product_code: string;
  barcode: string;
  product_name: string;
  is_medication: boolean;
  active_ingredient: string;
  concentration: string;
  therapeutic_class: string;
  prescription_stripe: string;
  indication: string;
  adult_dosage: string;
  pediatric_dosage: string;
  usage_instructions: string;
  warnings: string;
  interactions: string;
  contraindications: string;
  side_effects: string;
  storage_care: string;
  brand_synonyms: string;
  source: string;
  ai_model: string;
  reviewed_by_pharmacist: boolean;
  updated_by: string;
  updated_at?: string;
}

interface GuideSearchItem {
  code: string;
  barcode: string;
  name: string;
  has_posology: boolean;
  is_medication: boolean;
  reviewed_by_pharmacist: boolean;
  active_ingredient: string;
  concentration: string;
  therapeutic_class: string;
  prescription_stripe: string;
  brand_synonyms: string;
  stock_qty: number;
  sale_price: number;
  promo_price: number;
  crediario_price?: number;
  promo_vista?: string;
  vendas_30d?: number;
}

interface QaHistoryItem {
  id: number;
  question: string;
  answer_summary: string;
  clinical_details: string;
  warnings: string;
  related_ingredients: string;
  ai_model: string;
  asked_by: string;
  updated_at: string;
}

interface ProductPosologyModalProps {
  isOpen: boolean;
  initialProduct: PosologyProductRef | null;
  operatorName?: string;
  selectedPaymentMethod?: string;
  onClose: () => void;
  onAddProductToCart?: (product: any) => void;
  onPosologyUpdated?: (code: string, record: ProductPosologyRecord) => void;
}

const EXAMPLE_QUESTIONS = [
  'Interação entre Losartana e Ibuprofeno?',
  'Qual o princípio ativo e posologia do Dorflex?',
  'Analgésico mais seguro para gestante?',
  'Pode tomar Amoxicilina com leite ou após refeição?'
];

function computeDisplayPrice(prod: any, paymentMethod?: string): number {
  const sale = Math.max(0, Number(prod?.sale_price || 0));
  const promo = Math.max(0, Number(prod?.promo_price || 0));
  const cred = Math.max(0, Number(prod?.crediario_price || 0));
  const promoVista = String(prod?.promo_vista || '').toUpperCase() === 'S';
  if (paymentMethod === 'CREDIARIO') {
    if (cred > 0) return cred;
    if (promo > 0 && promoVista) return sale;
  }
  return promo > 0 ? promo : sale;
}

export const ProductPosologyModal: React.FC<ProductPosologyModalProps> = ({
  isOpen,
  initialProduct,
  operatorName = 'Farmacêutico',
  selectedPaymentMethod = 'DINHEIRO',
  onClose,
  onAddProductToCart,
  onPosologyUpdated
}) => {
  const { addToast } = useToast();
  const baseId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const askInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'GUIDE' | 'ASK'>('GUIDE');

  // Estado da Aba 1 (Busca + Ficha Clínica + Equivalentes)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GuideSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<PosologyProductRef | null>(null);
  const [record, setRecord] = useState<ProductPosologyRecord | null>(null);
  const [equivalents, setEquivalents] = useState<any[]>([]);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Modo edição manual
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [editForm, setEditForm] = useState({
    is_medication: true,
    active_ingredient: '',
    concentration: '',
    therapeutic_class: '',
    prescription_stripe: '',
    indication: '',
    adult_dosage: '',
    pediatric_dosage: '',
    usage_instructions: '',
    warnings: '',
    interactions: '',
    contraindications: '',
    side_effects: '',
    storage_care: '',
    brand_synonyms: ''
  });

  // Estado da Aba 2 (Pergunta Rápida / Busca Livre)
  const [questionInput, setQuestionInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [activeQa, setActiveQa] = useState<QaHistoryItem | null>(null);
  const [qaHistory, setQaHistory] = useState<QaHistoryItem[]>([]);
  const [qaError, setQaError] = useState('');

  // Sincronização com <dialog>.showModal() (modern-web-guidance: dialog)
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (isOpen) {
      if (!dlg.open) dlg.showModal();
    } else if (dlg.open) {
      dlg.close();
    }
  }, [isOpen]);

  const fetchGuideSearch = useCallback(async (q: string) => {
    setIsSearching(true);
    try {
      const res = await fetch(`/api/erp/posology/search?q=${encodeURIComponent(q)}&limit=30`);
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.data || []);
      }
    } catch (_) {
    } finally {
      setIsSearching(false);
    }
  }, []);

  const fetchQaHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/erp/posology/ask/history?limit=15');
      if (res.ok) {
        const json = await res.json();
        setQaHistory(json.data || []);
      }
    } catch (_) {}
  }, []);

  const fetchEquivalents = useCallback(async (code: string) => {
    try {
      const res = await fetch(`/api/erp/posology/${encodeURIComponent(code)}/equivalents?limit=10`);
      if (res.ok) {
        const json = await res.json();
        setEquivalents(json.data || []);
      } else {
        setEquivalents([]);
      }
    } catch (_) {
      setEquivalents([]);
    }
  }, []);

  const populateEditForm = (rec: ProductPosologyRecord | null) => {
    setEditForm({
      is_medication: rec ? rec.is_medication : true,
      active_ingredient: rec?.active_ingredient || '',
      concentration: rec?.concentration || '',
      therapeutic_class: rec?.therapeutic_class || '',
      prescription_stripe: rec?.prescription_stripe || '',
      indication: rec?.indication || '',
      adult_dosage: rec?.adult_dosage || '',
      pediatric_dosage: rec?.pediatric_dosage || '',
      usage_instructions: rec?.usage_instructions || '',
      warnings: rec?.warnings || '',
      interactions: rec?.interactions || '',
      contraindications: rec?.contraindications || '',
      side_effects: rec?.side_effects || '',
      storage_care: rec?.storage_care || '',
      brand_synonyms: rec?.brand_synonyms || ''
    });
  };

  const loadProductPosology = useCallback(async (prod: PosologyProductRef, force = false) => {
    setSelectedProduct(prod);
    setIsEditing(false);
    setLoadError('');
    setEquivalents([]);
    if (force) setIsRegenerating(true);
    else setIsLoadingRecord(true);

    try {
      // 1. Se não for regeneração forçada, tenta leitura instantânea do cache SQLite
      if (!force) {
        const getRes = await fetch(
          `/api/erp/posology/${encodeURIComponent(prod.code)}?barcode=${encodeURIComponent(prod.barcode || '')}`
        );
        if (getRes.ok) {
          const getJson = await getRes.json();
          if (getJson.found && getJson.data) {
            setRecord(getJson.data);
            populateEditForm(getJson.data);
            onPosologyUpdated?.(prod.code, getJson.data);
            fetchEquivalents(prod.code);
            setIsLoadingRecord(false);
            return;
          }
        }
      }

      // 2. Não encontrado (ou regeneração solicitada): consulta IA e salva no SQLite
      const lookupRes = await fetch('/api/erp/posology/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_code: prod.code,
          barcode: prod.barcode || '',
          product_name: prod.name,
          wait: true,
          force
        })
      });
      const lookupJson = await lookupRes.json();
      if (lookupRes.ok && lookupJson.success && lookupJson.data) {
        setRecord(lookupJson.data);
        populateEditForm(lookupJson.data);
        onPosologyUpdated?.(prod.code, lookupJson.data);
        fetchEquivalents(prod.code);
        if (force) {
          addToast('Ficha atualizada pela IA e salva no banco local!', 'success', 2500);
        }
      } else {
        setRecord(null);
        populateEditForm(null);
        setLoadError(lookupJson.error || 'Não foi possível consultar a posologia deste item agora.');
      }
    } catch (err: any) {
      setRecord(null);
      populateEditForm(null);
      setLoadError(err?.message || 'Erro de conexão ao consultar posologia.');
    } finally {
      setIsLoadingRecord(false);
      setIsRegenerating(false);
    }
  }, [addToast, fetchEquivalents, onPosologyUpdated]);

  // Ao abrir a modal
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('GUIDE');
    setIsEditing(false);
    setLoadError('');
    setQaError('');
    fetchQaHistory();

    if (initialProduct) {
      loadProductPosology(initialProduct, false);
    } else {
      setSelectedProduct(null);
      setRecord(null);
      setEquivalents([]);
      setSearchQuery('');
      fetchGuideSearch('');
      setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, [isOpen, initialProduct?.code, initialProduct?.name]);

  // Debounce da busca do Guia Farmacêutico
  useEffect(() => {
    if (!isOpen || selectedProduct) return;
    const timer = setTimeout(() => {
      fetchGuideSearch(searchQuery);
    }, 180);
    return () => clearTimeout(timer);
  }, [isOpen, selectedProduct, searchQuery, fetchGuideSearch]);

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setIsSavingManual(true);
    try {
      const res = await fetch(`/api/erp/posology/${encodeURIComponent(selectedProduct.code)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: selectedProduct.barcode || '',
          product_name: selectedProduct.name,
          ...editForm,
          updated_by: operatorName || 'Farmacêutico'
        })
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setRecord(json.data);
        populateEditForm(json.data);
        setIsEditing(false);
        setLoadError('');
        onPosologyUpdated?.(selectedProduct.code, json.data);
        fetchEquivalents(selectedProduct.code);
        addToast('Ficha salva com selo "Revisado pelo Farmacêutico"!', 'success', 2800);
      } else {
        addToast(json.error || 'Erro ao salvar edição manual.', 'error');
      }
    } catch (_) {
      addToast('Falha ao salvar alterações no servidor.', 'error');
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleAskQuestion = async (e?: React.FormEvent, presetQuestion?: string) => {
    if (e) e.preventDefault();
    const q = (presetQuestion ?? questionInput).trim();
    if (q.length < 3) {
      addToast('Digite uma dúvida clínica com pelo menos 3 caracteres.', 'warning', 2200);
      return;
    }
    if (presetQuestion) setQuestionInput(presetQuestion);
    setIsAsking(true);
    setQaError('');
    try {
      const res = await fetch('/api/erp/posology/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, asked_by: operatorName })
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setActiveQa(json.data);
        fetchQaHistory();
      } else {
        setQaError(json.error || 'Não foi possível consultar a IA no momento.');
      }
    } catch (_) {
      setQaError('Falha de conexão ao consultar o assistente clínico.');
    } finally {
      setIsAsking(false);
    }
  };

  const synonymsList = (record?.brand_synonyms || '')
    .split(/[,;/]+/)
    .map(s => s.trim())
    .filter(Boolean);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${baseId}-title`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={(e) => {
        e.currentTarget.returnValue = '';
        if (isOpen) onClose();
      }}
      className="controlled-recipe-dialog m-auto w-[96vw] max-w-4xl max-h-[92dvh] p-0 rounded-2xl border-2 border-teal-700/70 bg-slate-50 text-slate-900 shadow-2xl overflow-hidden"
    >
      {/* Cabeçalho Institucional */}
      <div className="px-4 py-3 bg-gradient-to-r from-[#0b2545] via-[#0f3460] to-[#0f4c5c] text-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-teal-500/20 border border-teal-400/40 shrink-0">
            <Pill className="w-5 h-5 text-teal-300" />
          </div>
          <div className="min-w-0">
            <h1 id={`${baseId}-title`} className="text-sm sm:text-base font-black tracking-tight flex items-center gap-2">
              <span>Guia Farmacêutico & Posologia</span>
              <span className="hidden sm:inline text-[10px] font-mono uppercase bg-teal-500/25 border border-teal-300/40 text-teal-200 px-2 py-0.5 rounded-full">
                Balcão BelaFarma
              </span>
            </h1>
            <p className="text-[11px] text-slate-300 truncate">
              Consulta rápida de princípio ativo, posologia, interações, equivalentes em estoque e dúvidas clínicas
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar Guia Farmacêutico"
          className="p-1.5 rounded-lg hover:bg-white/15 text-slate-200 cursor-pointer transition-colors shrink-0"
          title="Fechar (ESC)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navegação por Abas */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('GUIDE')}
            className={`px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'GUIDE'
                ? 'bg-[#0f3460] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <Pill className="w-3.5 h-3.5" />
            <span>Ficha & Equivalentes</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('ASK');
              setTimeout(() => askInputRef.current?.focus(), 60);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'ASK'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-950'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Pergunta Rápida / Busca Livre</span>
          </button>
        </div>

        {activeTab === 'GUIDE' && selectedProduct && (
          <button
            type="button"
            onClick={() => {
              setSelectedProduct(null);
              setRecord(null);
              setIsEditing(false);
              setLoadError('');
              fetchGuideSearch(searchQuery);
              setTimeout(() => searchInputRef.current?.focus(), 60);
            }}
            className="text-xs font-bold text-[#0f3460] hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Pesquisar outro medicamento</span>
          </button>
        )}
      </div>

      {/* CORPO DA MODAL */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ================================================================= */}
        {/* ABA 1: FICHA CLÍNICA + BUSCA NO CATÁLOGO + EQUIVALENTES EM ESTOQUE */}
        {/* ================================================================= */}
        {activeTab === 'GUIDE' && !selectedProduct && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Pesquisar por medicamento, princípio ativo (ex: Dipirona, Losartana), marca (ex: Dorflex, Novalgina) ou EAN..."
                className="w-full pl-9 pr-10 py-2 bg-white border-2 border-slate-300 focus:border-teal-600 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none shadow-2xs"
              />
              {isSearching && (
                <RefreshCw className="w-4 h-4 animate-spin text-teal-600 absolute right-3 top-2.5" />
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold px-1">
              <span>
                {searchQuery.trim()
                  ? `Resultados para "${searchQuery.trim()}" (${searchResults.length})`
                  : `Medicamentos mais vendidos já com ficha pronta (${searchResults.length})`}
              </span>
              <span>Clique em um item para abrir a ficha completa</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {searchResults.length === 0 && !isSearching ? (
                <div className="sm:col-span-2 p-8 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-500">
                  Nenhum produto encontrado para essa busca. Experimente usar a aba{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setQuestionInput(searchQuery);
                      setActiveTab('ASK');
                    }}
                    className="text-teal-700 font-black underline cursor-pointer"
                  >
                    Pergunta Rápida / Busca Livre
                  </button>
                  .
                </div>
              ) : (
                searchResults.map(item => {
                  const unitPrice = computeDisplayPrice(item, selectedPaymentMethod);
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() =>
                        loadProductPosology({
                          code: item.code,
                          barcode: item.barcode,
                          name: item.name
                        })
                      }
                      className="text-left p-3 bg-white hover:bg-teal-50/60 border border-slate-200 hover:border-teal-400 rounded-xl transition-all shadow-2xs cursor-pointer flex flex-col justify-between gap-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-black text-xs text-[#0b2545] leading-snug line-clamp-2">
                            {item.name}
                          </div>
                          {item.active_ingredient && (
                            <div className="text-[11px] text-teal-800 font-bold truncate mt-0.5">
                              {item.active_ingredient} {item.concentration ? `• ${item.concentration}` : ''}
                            </div>
                          )}
                        </div>
                        {item.has_posology ? (
                          <span
                            className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                              item.reviewed_by_pharmacist
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-sky-100 text-sky-800 border-sky-300'
                            }`}
                          >
                            {item.reviewed_by_pharmacist ? 'Revisado' : 'Ficha pronta'}
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                            Consultar IA
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-100">
                        <span>
                          Est:{' '}
                          <strong className={item.stock_qty > 0 ? 'text-emerald-700' : 'text-rose-600'}>
                            {item.stock_qty} un
                          </strong>
                        </span>
                        {unitPrice > 0 && (
                          <span className="font-black text-slate-800">R$ {unitPrice.toFixed(2)}</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'GUIDE' && selectedProduct && (
          <div className="space-y-3.5">
            {/* Cabeçalho do Produto Selecionado */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] font-bold bg-slate-100 border border-slate-300 text-slate-700 px-2 py-0.5 rounded">
                    Cód: {selectedProduct.code}
                  </span>
                  {selectedProduct.barcode && (
                    <span className="font-mono text-[11px] text-slate-500">EAN: {selectedProduct.barcode}</span>
                  )}
                  {record?.prescription_stripe && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
                      {record.prescription_stripe}
                    </span>
                  )}
                  {record && (
                    record.reviewed_by_pharmacist ? (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 inline-flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Revisado pelo Farmacêutico</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300 inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        <span>{record.ai_model ? `IA (${record.ai_model})` : 'Base Clínica'}</span>
                      </span>
                    )
                  )}
                </div>

                <h2 className="text-base font-black text-[#0b2545] uppercase leading-tight">
                  {selectedProduct.name}
                </h2>

                {record?.is_medication && (record.active_ingredient || record.therapeutic_class) && (
                  <div className="text-xs font-bold text-teal-800 flex flex-wrap items-center gap-2">
                    {record.active_ingredient && (
                      <span>
                        Princípio Ativo: <strong>{record.active_ingredient}</strong>
                        {record.concentration ? ` (${record.concentration})` : ''}
                      </span>
                    )}
                    {record.therapeutic_class && (
                      <span className="text-slate-600 font-semibold">• {record.therapeutic_class}</span>
                    )}
                  </div>
                )}
              </div>

              {!isLoadingRecord && !isEditing && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      populateEditForm(record);
                      setIsEditing(true);
                    }}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-blue-700" />
                    <span>{record ? 'Editar' : 'Preencher Manual'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isRegenerating}
                    onClick={() => loadProductPosology(selectedProduct, true)}
                    className="px-2.5 py-1.5 bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    title="Consultar novamente a IA e atualizar esta ficha"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                    <span>Regenerar IA</span>
                  </button>
                </div>
              )}
            </div>

            {/* Estado de Carregamento */}
            {isLoadingRecord && (
              <div className="p-8 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-600">
                <RefreshCw className="w-6 h-6 animate-spin text-teal-600" />
                <div className="text-sm font-bold text-slate-800">Consultando ficha clínica e posologia...</div>
                <p className="text-xs text-slate-500">
                  O resultado será salvo definitivamente no SQLite para consultas instantâneas futuras.
                </p>
              </div>
            )}

            {/* Estado de Erro (ex.: créditos de IA esgotados) */}
            {!isLoadingRecord && loadError && !isEditing && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                <div className="flex items-start gap-2 text-amber-950">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs font-bold leading-relaxed">{loadError}</div>
                </div>
                <div className="flex items-center gap-2 pl-7">
                  <button
                    type="button"
                    onClick={() => {
                      populateEditForm(null);
                      setIsEditing(true);
                    }}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-black cursor-pointer"
                  >
                    Preencher ficha manualmente agora
                  </button>
                </div>
              </div>
            )}

            {/* Produto classificado como NÃO-MEDICAMENTO */}
            {!isLoadingRecord && !isEditing && record && !record.is_medication && (
              <div className="p-5 bg-slate-100 border border-slate-300 rounded-xl text-center space-y-2">
                <Info className="w-6 h-6 text-slate-500 mx-auto" />
                <div className="text-sm font-black text-slate-800">
                  Produto classificado como Não-Medicamento
                </div>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Este item foi salvo como perfumaria, higiene, conveniência ou correlato sem posologia medicamentosa, para não consumir consultas futuras de IA. Se for medicamento, clique em <strong>Editar</strong> acima.
                </p>
              </div>
            )}

            {/* VISUALIZAÇÃO ESTRUTURADA DA FICHA CLÍNICA */}
            {!isLoadingRecord && !isEditing && record && record.is_medication && (
              <div className="space-y-3">
                {/* Para que serve */}
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                  <div className="text-[11px] font-black uppercase tracking-wider text-teal-800 mb-1">
                    Para que serve (Indicação)
                  </div>
                  <p className="text-xs sm:text-[13px] font-medium text-slate-800 leading-relaxed">
                    {record.indication || 'Não informado.'}
                  </p>
                </div>

                {/* Posologia Adulto + Pediátrica */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
                    <div className="text-[11px] font-black uppercase tracking-wider text-emerald-900 mb-1">
                      Posologia Adulto
                    </div>
                    <p className="text-xs sm:text-[13px] font-semibold text-slate-900 leading-relaxed">
                      {record.adult_dosage || 'Conforme prescrição médica.'}
                    </p>
                  </div>

                  <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-3">
                    <div className="text-[11px] font-black uppercase tracking-wider text-sky-900 mb-1">
                      Posologia Pediátrica
                    </div>
                    <p className="text-xs sm:text-[13px] font-semibold text-slate-900 leading-relaxed">
                      {record.pediatric_dosage || 'Somente sob prescrição médica.'}
                    </p>
                  </div>
                </div>

                {/* Modo de usar / Intervalo */}
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                  <div className="text-[11px] font-black uppercase tracking-wider text-[#0f3460] mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Modo de Usar / Intervalo</span>
                  </div>
                  <p className="text-xs sm:text-[13px] text-slate-800 leading-relaxed">
                    {record.usage_instructions || 'Seguir orientação da bula ou receita.'}
                  </p>
                </div>

                {/* Alertas principais */}
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3">
                  <div className="text-[11px] font-black uppercase tracking-wider text-amber-950 mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                    <span>Alertas Principais de Balcão</span>
                  </div>
                  <p className="text-xs sm:text-[13px] font-semibold text-amber-950 leading-relaxed">
                    {record.warnings || 'Conferir alergias, gestação e uso concomitante de outros medicamentos.'}
                  </p>
                </div>

                {/* Interações + Contraindicações */}
                {(record.interactions || record.contraindications) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                      <div className="text-[11px] font-black uppercase tracking-wider text-rose-800 mb-1">
                        Interações Medicamentosas
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {record.interactions || 'Sem interações críticas destacadas.'}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                      <div className="text-[11px] font-black uppercase tracking-wider text-rose-800 mb-1">
                        Contraindicações
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {record.contraindications || 'Hipersensibilidade aos componentes da fórmula.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Efeitos colaterais + Armazenamento */}
                {(record.side_effects || record.storage_care) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                      <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                        Efeitos Colaterais Comuns
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {record.side_effects || 'Geralmente bem tolerado nas doses usuais.'}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                      <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1 flex items-center gap-1.5">
                        <Thermometer className="w-3.5 h-3.5 text-sky-600" />
                        <span>Armazenamento</span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {record.storage_care || 'Conservar em temperatura ambiente (15°C a 30°C), protegido da luz e umidade.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Sinônimos comerciais / Marcas de referência */}
                {synonymsList.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                      Marcas de Referência / Sinônimos Comerciais
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {synonymsList.map((syn, idx) => (
                        <span
                          key={`${syn}-${idx}`}
                          className="text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-300 px-2 py-0.5 rounded-full"
                        >
                          {syn}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* EQUIVALENTES DISPONÍVEIS NO ESTOQUE DA BELAFARMA */}
                {equivalents.length > 0 && (
                  <div className="bg-white border-2 border-emerald-200 rounded-xl p-3 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-emerald-600" />
                        <span>Equivalentes / Mesmo Princípio Ativo em Estoque ({equivalents.length})</span>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                      {equivalents.map(eq => {
                        const eqPrice = computeDisplayPrice(eq, selectedPaymentMethod);
                        return (
                          <div
                            key={eq.code}
                            className="py-1.5 flex items-center justify-between gap-2 text-xs hover:bg-emerald-50/40 px-1.5 rounded"
                          >
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  loadProductPosology({ code: eq.code, barcode: eq.barcode, name: eq.name })
                                }
                                className="font-bold text-[#0b2545] hover:text-teal-700 text-left truncate block max-w-full cursor-pointer"
                              >
                                {eq.name}
                              </button>
                              <div className="text-[10px] font-mono text-slate-500">
                                Cód: {eq.code} • Estoque:{' '}
                                <strong className="text-emerald-700">{eq.stock_qty} un</strong>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono font-black text-emerald-700 text-xs">
                                R$ {eqPrice.toFixed(2)}
                              </span>
                              {onAddProductToCart && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onAddProductToCart(eq);
                                    onClose();
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-black flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Incluir</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Aviso Fixo Legal / Balcão */}
                <div className="px-3 py-2 bg-slate-200/70 border border-slate-300 rounded-lg text-[11px] text-slate-700 font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-600 shrink-0" />
                  <span>
                    Orientação auxiliar de balcão. Conferir sempre a bula oficial ANVISA e a prescrição médica/odontológica antes da dispensação.
                  </span>
                </div>
              </div>
            )}

            {/* FORMULÁRIO DE EDIÇÃO MANUAL (SELO REVISADO PELO FARMACÊUTICO) */}
            {isEditing && (
              <form onSubmit={handleSaveManual} className="bg-white border border-slate-300 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="text-xs font-black uppercase text-[#0b2545]">
                    Edição Farmacêutica (salva com selo "Revisado pelo Farmacêutico")
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      id={`${baseId}-edit-ismed`}
                      type="checkbox"
                      checked={editForm.is_medication}
                      onChange={e => setEditForm(prev => ({ ...prev, is_medication: e.target.checked }))}
                      className="w-4 h-4 accent-teal-700"
                    />
                    <label htmlFor={`${baseId}-edit-ismed`} className="text-xs font-bold text-slate-800 cursor-pointer">
                      É medicamento
                    </label>
                  </div>
                </div>

                {editForm.is_medication && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <label htmlFor={`${baseId}-ed-ai`} className="block font-bold text-slate-700 mb-0.5">Princípio Ativo</label>
                      <input
                        id={`${baseId}-ed-ai`}
                        type="text"
                        value={editForm.active_ingredient}
                        onChange={e => setEditForm(p => ({ ...p, active_ingredient: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${baseId}-ed-conc`} className="block font-bold text-slate-700 mb-0.5">Concentração / Forma</label>
                      <input
                        id={`${baseId}-ed-conc`}
                        type="text"
                        value={editForm.concentration}
                        onChange={e => setEditForm(p => ({ ...p, concentration: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${baseId}-ed-class`} className="block font-bold text-slate-700 mb-0.5">Classe Terapêutica</label>
                      <input
                        id={`${baseId}-ed-class`}
                        type="text"
                        value={editForm.therapeutic_class}
                        onChange={e => setEditForm(p => ({ ...p, therapeutic_class: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${baseId}-ed-stripe`} className="block font-bold text-slate-700 mb-0.5">Tarja / Exigência de Receita</label>
                      <input
                        id={`${baseId}-ed-stripe`}
                        type="text"
                        value={editForm.prescription_stripe}
                        onChange={e => setEditForm(p => ({ ...p, prescription_stripe: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`${baseId}-ed-ind`} className="block font-bold text-slate-700 mb-0.5">Para que serve</label>
                      <textarea
                        id={`${baseId}-ed-ind`}
                        rows={2}
                        value={editForm.indication}
                        onChange={e => setEditForm(p => ({ ...p, indication: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${baseId}-ed-ad`} className="block font-bold text-slate-700 mb-0.5">Posologia Adulto</label>
                      <textarea
                        id={`${baseId}-ed-ad`}
                        rows={2}
                        value={editForm.adult_dosage}
                        onChange={e => setEditForm(p => ({ ...p, adult_dosage: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${baseId}-ed-ped`} className="block font-bold text-slate-700 mb-0.5">Posologia Pediátrica</label>
                      <textarea
                        id={`${baseId}-ed-ped`}
                        rows={2}
                        value={editForm.pediatric_dosage}
                        onChange={e => setEditForm(p => ({ ...p, pediatric_dosage: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`${baseId}-ed-use`} className="block font-bold text-slate-700 mb-0.5">Modo de usar / Intervalo</label>
                      <textarea
                        id={`${baseId}-ed-use`}
                        rows={2}
                        value={editForm.usage_instructions}
                        onChange={e => setEditForm(p => ({ ...p, usage_instructions: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`${baseId}-ed-warn`} className="block font-bold text-slate-700 mb-0.5">Alertas Principais</label>
                      <textarea
                        id={`${baseId}-ed-warn`}
                        rows={2}
                        value={editForm.warnings}
                        onChange={e => setEditForm(p => ({ ...p, warnings: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${baseId}-ed-int`} className="block font-bold text-slate-700 mb-0.5">Interações Medicamentosas</label>
                      <textarea
                        id={`${baseId}-ed-int`}
                        rows={2}
                        value={editForm.interactions}
                        onChange={e => setEditForm(p => ({ ...p, interactions: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${baseId}-ed-contra`} className="block font-bold text-slate-700 mb-0.5">Contraindicações</label>
                      <textarea
                        id={`${baseId}-ed-contra`}
                        rows={2}
                        value={editForm.contraindications}
                        onChange={e => setEditForm(p => ({ ...p, contraindications: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${baseId}-ed-se`} className="block font-bold text-slate-700 mb-0.5">Efeitos Colaterais Comuns</label>
                      <textarea
                        id={`${baseId}-ed-se`}
                        rows={2}
                        value={editForm.side_effects}
                        onChange={e => setEditForm(p => ({ ...p, side_effects: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${baseId}-ed-stor`} className="block font-bold text-slate-700 mb-0.5">Armazenamento</label>
                      <textarea
                        id={`${baseId}-ed-stor`}
                        rows={2}
                        value={editForm.storage_care}
                        onChange={e => setEditForm(p => ({ ...p, storage_care: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`${baseId}-ed-syn`} className="block font-bold text-slate-700 mb-0.5">
                        Marcas de Referência / Sinônimos (separados por vírgula)
                      </label>
                      <input
                        id={`${baseId}-ed-syn`}
                        type="text"
                        value={editForm.brand_synonyms}
                        onChange={e => setEditForm(p => ({ ...p, brand_synonyms: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingManual}
                    className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSavingManual ? 'Salvando...' : 'Salvar como Revisado pelo Farmacêutico'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* ABA 2: PERGUNTA RÁPIDA / BUSCA LIVRE DE BALCÃO                    */}
        {/* ================================================================= */}
        {activeTab === 'ASK' && (
          <div className="space-y-4">
            <form onSubmit={e => handleAskQuestion(e)} className="space-y-2">
              <label htmlFor={`${baseId}-ask-input`} className="block text-xs font-black text-[#0b2545]">
                Tire uma dúvida clínica ou pesquise qualquer medicamento (mesmo fora do cadastro):
              </label>
              <div className="flex gap-2">
                <input
                  ref={askInputRef}
                  id={`${baseId}-ask-input`}
                  type="text"
                  value={questionInput}
                  onChange={e => setQuestionInput(e.target.value)}
                  placeholder="Ex.: Interação entre Losartana e Ibuprofeno? Qual o princípio ativo do remédio X?"
                  className="flex-1 px-3 py-2 bg-white border-2 border-slate-300 focus:border-teal-600 rounded-xl text-xs sm:text-sm font-medium focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isAsking}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {isAsking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>Consultar</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {EXAMPLE_QUESTIONS.map(ex => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => handleAskQuestion(undefined, ex)}
                    className="text-[11px] font-semibold bg-white hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-300 px-2.5 py-1 rounded-full cursor-pointer transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </form>

            {qaError && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs font-bold text-amber-950 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{qaError}</span>
              </div>
            )}

            {activeQa && (
              <div className="bg-white border-2 border-teal-200 rounded-xl p-4 space-y-3 shadow-xs">
                <div className="text-xs font-black text-teal-900 border-b border-slate-100 pb-2">
                  {activeQa.question}
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-900 leading-relaxed">
                  {activeQa.answer_summary}
                </p>
                {activeQa.clinical_details && (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed">
                    <strong className="text-slate-900 block mb-0.5">Detalhes de balcão:</strong>
                    {activeQa.clinical_details}
                  </div>
                )}
                {activeQa.warnings && (
                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs font-semibold text-amber-950 leading-relaxed">
                    <strong className="block mb-0.5">Alertas de segurança:</strong>
                    {activeQa.warnings}
                  </div>
                )}
                {activeQa.related_ingredients && (
                  <div className="text-[11px] text-teal-800 font-bold">
                    Princípios ativos relacionados: {activeQa.related_ingredients}
                  </div>
                )}
              </div>
            )}

            {qaHistory.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-black uppercase text-slate-500">
                  Dúvidas recentes salvas (consulta instantânea):
                </div>
                <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-xl overflow-hidden">
                  {qaHistory.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveQa(item)}
                      className="w-full text-left px-3 py-2 hover:bg-teal-50 text-xs flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="font-bold text-slate-800 truncate">{item.question}</span>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">Ver resposta</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="px-4 py-2.5 bg-slate-200/80 border-t border-slate-300 flex items-center justify-between text-xs shrink-0">
        <span className="text-[11px] text-slate-600 font-medium">
          As fichas consultadas ficam salvas no banco local da farmácia.
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer"
        >
          Fechar (ESC)
        </button>
      </div>
    </dialog>
  );
};
