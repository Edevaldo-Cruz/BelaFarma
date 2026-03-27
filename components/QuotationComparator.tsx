import React, { useState, useMemo } from 'react';
import {
  ArrowLeft, Plus, Trash2, BarChart3, TrendingDown, Trophy,
  CheckCircle2, AlertCircle, Sparkles, Loader2,
  DollarSign, Package, Star, ChevronDown, ChevronUp
} from 'lucide-react';
import { useToast } from './ToastContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Supplier {
  id: string;
  name: string;
  text: string;
}

interface ParsedProduct {
  name: string;
  price: number;
  condition?: string;  // ex: "acima de 36 unidades"
  validity?: string;
  rawLine: string;
}

interface SupplierResult {
  supplierId: string;
  supplierName: string;
  products: ParsedProduct[];
}

interface ComparisonProduct {
  name: string;                                    // nome canônico
  entries: { supplierId: string; price: number; condition?: string; validity?: string; rawLine: string }[];
  bestSupplierId: string | null;
  bestPrice: number | null;
  worstPrice: number | null;
}

interface QuotationComparatorProps {
  onBack: () => void;
}

// ─── Color palette ───────────────────────────────────────────────────────────

const SUPPLIER_COLORS = [
  { dot: 'bg-blue-500',    header: 'from-blue-600 to-blue-700',    badge: 'bg-blue-100 text-blue-700 border-blue-200',    ring: 'ring-blue-400',    border: 'border-blue-300',    light: 'bg-blue-50' },
  { dot: 'bg-violet-500',  header: 'from-violet-600 to-violet-700',badge: 'bg-violet-100 text-violet-700 border-violet-200',ring: 'ring-violet-400', border: 'border-violet-300', light: 'bg-violet-50' },
  { dot: 'bg-rose-500',    header: 'from-rose-600 to-rose-700',    badge: 'bg-rose-100 text-rose-700 border-rose-200',    ring: 'ring-rose-400',    border: 'border-rose-300',    light: 'bg-rose-50' },
  { dot: 'bg-amber-500',   header: 'from-amber-500 to-amber-600',  badge: 'bg-amber-100 text-amber-700 border-amber-200',  ring: 'ring-amber-400',   border: 'border-amber-300',   light: 'bg-amber-50' },
  { dot: 'bg-emerald-500', header: 'from-emerald-600 to-emerald-700', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', ring: 'ring-emerald-400', border: 'border-emerald-300', light: 'bg-emerald-50' },
];

// ─── Local Parsing Engine ────────────────────────────────────────────────────

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Extrai (produto, preço, condição, validade) de texto livre.
 * Suporta:
 *  - "DIPIRONA 500MG 3,50"
 *  - "AMOXIL R$ 12,90 acima de 36 unidades"
 *  - "VITAMINA C 500MG - 4,80 validade 30/06/2025"
 *  - "6,59 PRODUTO NOME"
 */
function parseQuotationText(text: string): ParsedProduct[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results: ParsedProduct[] = [];

  const priceRegex = /R?\$?\s*(\d{1,6}[.,]\d{2})\b/g;
  const conditionRegex = /(?:acima\s+de|a\s+partir\s+de|min(?:imo|\.)?|m[aí]nimo)\s+(?:de\s+)?(\d+)\s*(?:un(?:id(?:ades?)?)?|caixas?|pcs?)?/i;
  const validityRegex = /val(?:idade|id\.?)?\.?\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i;

  for (const line of lines) {
    const matches = [...line.matchAll(priceRegex)];
    if (matches.length === 0) continue;

    // Pega o último preço encontrado na linha (padrão: nome ... preço)
    const lastMatch = matches[matches.length - 1];
    const priceStr = lastMatch[1].replace(',', '.');
    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) continue;

    // Remove o preço para obter o nome
    let remainder = line
      .replace(lastMatch[0], '')
      .replace(/R\$\s*/g, '')
      .replace(/^\d+[.,]\d+\s*/, '')
      .replace(/[-–—|*#]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Extrai condição de quantidade
    const condMatch = remainder.match(conditionRegex);
    const condition = condMatch ? condMatch[0].trim() : undefined;
    if (condition) remainder = remainder.replace(conditionRegex, '').trim();

    // Extrai validade
    const valMatch = remainder.match(validityRegex);
    const validity = valMatch ? valMatch[1].trim() : undefined;
    if (validity) remainder = remainder.replace(validityRegex, '').trim();

    // Nome do produto = o que sobrou
    const productName = remainder
      .replace(/[-–—:,]+$/, '')
      .replace(/^\s*[-–—:,]+/, '')
      .trim();
    if (productName.length < 2) continue;

    results.push({ name: productName, price, condition, validity, rawLine: line });
  }

  return results;
}

/** Similaridade entre nomes de produto (Jaccard sobre tokens) */
function productSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const tokensA = new Set(na.split(/\s+/).filter(t => t.length > 2));
  const tokensB = new Set(nb.split(/\s+/).filter(t => t.length > 2));
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

const SIMILARITY_THRESHOLD = 0.5;

function buildComparison(supplierResults: SupplierResult[]): ComparisonProduct[] {
  // Flatten all entries
  const allEntries: { supplierId: string; product: ParsedProduct }[] = [];
  for (const sr of supplierResults) {
    for (const p of sr.products) {
      allEntries.push({ supplierId: sr.supplierId, product: p });
    }
  }

  // Group by product name similarity
  const groups: { canonical: string; entries: { supplierId: string; price: number; condition?: string; validity?: string; rawLine: string }[] }[] = [];

  for (const { supplierId, product } of allEntries) {
    let found = false;
    for (const group of groups) {
      if (productSimilarity(group.canonical, product.name) >= SIMILARITY_THRESHOLD) {
        if (product.name.length > group.canonical.length) group.canonical = product.name;
        group.entries.push({ supplierId, price: product.price, condition: product.condition, validity: product.validity, rawLine: product.rawLine });
        found = true;
        break;
      }
    }
    if (!found) {
      groups.push({ canonical: product.name, entries: [{ supplierId, price: product.price, condition: product.condition, validity: product.validity, rawLine: product.rawLine }] });
    }
  }

  return groups
    .filter(g => g.entries.length > 0)
    .map(group => {
      let bestSupplierId: string | null = null;
      let bestPrice: number | null = null;
      let worstPrice: number | null = null;

      for (const entry of group.entries) {
        if (bestPrice === null || entry.price < bestPrice) {
          bestPrice = entry.price;
          bestSupplierId = entry.supplierId;
        }
        if (worstPrice === null || entry.price > worstPrice) {
          worstPrice = entry.price;
        }
      }

      return { name: group.canonical, entries: group.entries, bestSupplierId, bestPrice, worstPrice };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// ─── Component ───────────────────────────────────────────────────────────────

const MAX_SUPPLIERS = 5;
const MIN_SUPPLIERS = 2;

const makeSupplier = (idx: number): Supplier => ({
  id: `sup_${Date.now()}_${idx}`,
  name: '',
  text: '',
});

export const QuotationComparator: React.FC<QuotationComparatorProps> = ({ onBack }) => {
  const { addToast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([
    makeSupplier(0),
    makeSupplier(1),
  ]);
  const [compared, setCompared] = useState(false);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [products, setProducts] = useState<ComparisonProduct[]>([]);
  const [supplierResults, setSupplierResults] = useState<SupplierResult[]>([]);
  const [expandedInputs, setExpandedInputs] = useState<Set<string>>(new Set());

  const validSuppliers = suppliers.filter(s => s.name.trim() && s.text.trim());

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAddSupplier = () => {
    if (suppliers.length >= MAX_SUPPLIERS) return;
    setSuppliers(prev => [...prev, makeSupplier(prev.length)]);
    setCompared(false);
  };

  const handleRemoveSupplier = (id: string) => {
    setSuppliers(prev => prev.filter(s => s.id !== id));
    setCompared(false);
  };

  const handleChange = (id: string, field: 'name' | 'text', value: string) => {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    setCompared(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedInputs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── AI comparison via Gemini ───────────────────────────────────────────────

  const handleCompareAI = async () => {
    setIsLoadingAI(true);
    try {
      const payload = {
        suppliers: validSuppliers.map(s => ({ id: s.id, name: s.name, text: s.text })),
      };
      const res = await fetch('/api/quotation/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      const data = await res.json();

      // Build SupplierResult from AI response
      const results: SupplierResult[] = (data.suppliers || []).map((sup: any) => {
        const original = validSuppliers.find(s => s.id === sup.id || s.name === sup.name);
        return {
          supplierId: original?.id || sup.id || sup.name,
          supplierName: sup.name,
          products: (sup.products || []).map((p: any) => ({
            name: p.name || p.product,
            price: parseFloat(String(p.price).replace(',', '.')),
            condition: p.condition || undefined,
            validity: p.validity || undefined,
            rawLine: p.rawLine || '',
          })).filter((p: ParsedProduct) => !isNaN(p.price) && p.price > 0),
        };
      });

      const comparison = buildComparison(results);
      setSupplierResults(results);
      setProducts(comparison);
      setCompared(true);
      addToast(`🤖 Gemini AI processou ${comparison.length} produtos!`, 'success');
    } catch (err: any) {
      console.error('AI analysis error:', err);
      addToast(`Erro na análise com IA: ${err.message}`, 'error');
    } finally {
      setIsLoadingAI(false);
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    if (!compared || products.length === 0) return null;

    const totalBestPrice = products.reduce((acc, p) => acc + (p.bestPrice || 0), 0);
    const totalWorstPrice = products.reduce((acc, p) => acc + (p.worstPrice || p.bestPrice || 0), 0);
    const totalSavings = totalWorstPrice - totalBestPrice;

    const wins: Record<string, number> = {};
    for (const p of products) {
      if (p.bestSupplierId) wins[p.bestSupplierId] = (wins[p.bestSupplierId] || 0) + 1;
    }

    let topSupplierId: string | null = null;
    let topWins = 0;
    for (const [id, count] of Object.entries(wins)) {
      if (count > topWins) { topWins = count; topSupplierId = id; }
    }

    return { totalBestPrice, totalSavings, wins, topSupplierId, topWins };
  }, [compared, products]);

  // ── Product entry per supplier (for column view) ───────────────────────────

  const getEntryForSupplier = (product: ComparisonProduct, supplierId: string) =>
    product.entries.find(e => e.supplierId === supplierId) || null;

  const getSupplierIndex = (supplierId: string) =>
    validSuppliers.findIndex(s => s.id === supplierId);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 pb-20">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm px-4 md:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Comparador de Cotações
            </h1>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
              Compare preços de até 5 fornecedores — com ou sem IA
            </p>
          </div>
          {/* Legend chips */}
          <div className="hidden md:flex items-center gap-2 text-[10px] font-bold">
            <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
              <Trophy className="w-3 h-3" /> Melhor preço
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">

        {/* ── Supplier Input Grid ─────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-slate-800 uppercase tracking-tighter text-sm">
                Fornecedores
                <span className="ml-2 text-[10px] font-bold text-slate-400 normal-case tracking-normal">
                  ({suppliers.length}/{MAX_SUPPLIERS})
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Cole o texto da cotação (WhatsApp, e-mail, etc.) em cada área.</p>
            </div>
            {suppliers.length < MAX_SUPPLIERS && (
              <button
                onClick={handleAddSupplier}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-700 transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Fornecedor
              </button>
            )}
          </div>

          {/* Grid of supplier cards */}
          <div className={`grid gap-4 ${
            suppliers.length <= 2 ? 'grid-cols-1 md:grid-cols-2' :
            suppliers.length === 3 ? 'grid-cols-1 md:grid-cols-3' :
            'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
          }`}>
            {suppliers.map((sup, idx) => {
              const colors = SUPPLIER_COLORS[idx % SUPPLIER_COLORS.length];
              const isExpanded = expandedInputs.has(sup.id);
              const parsedCount = sup.text ? parseQuotationText(sup.text).length : 0;

              return (
                <div
                  key={sup.id}
                  className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col"
                >
                  {/* Card header — colorido */}
                  <div className={`bg-gradient-to-r ${colors.header} p-4 flex items-center gap-3`}>
                    <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                      <span className="text-white font-black text-sm">{idx + 1}</span>
                    </div>
                    <input
                      type="text"
                      placeholder={`Nome do Fornecedor ${idx + 1}`}
                      value={sup.name}
                      onChange={e => handleChange(sup.id, 'name', e.target.value)}
                      className="flex-1 bg-transparent text-white font-black placeholder:text-white/50 outline-none text-sm"
                    />
                    <div className="flex items-center gap-1">
                      {parsedCount > 0 && (
                        <span className="text-[10px] font-black text-white bg-white/20 px-2 py-0.5 rounded-full">
                          {parsedCount} itens
                        </span>
                      )}
                      <button
                        onClick={() => toggleExpand(sup.id)}
                        className="p-1 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-all"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      {suppliers.length > MIN_SUPPLIERS && (
                        <button
                          onClick={() => handleRemoveSupplier(sup.id)}
                          className="p-1 text-white/60 hover:text-red-200 rounded-lg hover:bg-white/10 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Textarea */}
                  <textarea
                    rows={isExpanded ? 16 : 7}
                    placeholder={`Cole o texto da cotação...\n\nExemplos:\nDIPIRONA 500MG 3,50\nAMOXICILINA R$ 12,90\nVIT C 500 - 4,80 acima de 36 un\nOMEPRAZOL 20MG 6,59 val 30/06/25`}
                    value={sup.text}
                    onChange={e => handleChange(sup.id, 'text', e.target.value)}
                    className="flex-1 w-full p-4 text-xs font-mono text-slate-700 bg-slate-50 outline-none resize-none placeholder:text-slate-300 placeholder:font-sans leading-relaxed transition-all duration-300"
                  />

                </div>
              );
            })}
          </div>
        </section>

        {/* ── Action Button ─────────────────────────────────────────── */}
        <div className="flex items-center justify-center">
          <button
            onClick={handleCompareAI}
            disabled={validSuppliers.length < MIN_SUPPLIERS || isLoadingAI}
            className="flex items-center gap-3 px-12 py-4 bg-gradient-to-r from-blue-700 to-blue-800 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg shadow-blue-200 hover:from-blue-800 hover:to-blue-900 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoadingAI
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <Sparkles className="w-5 h-5" />
            }
            {isLoadingAI ? 'Processando com Gemini AI...' : 'Processar Comparativo com IA'}
            {!isLoadingAI && validSuppliers.length >= MIN_SUPPLIERS && (
              <span className="bg-white/20 px-2 py-0.5 rounded-lg text-[10px]">{validSuppliers.length} fornec.</span>
            )}
          </button>
        </div>

        {/* ── Tip ─────────────────────────────────────────────────────── */}
        {!compared && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4 max-w-2xl mx-auto">
            <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 font-medium leading-relaxed">
              O Gemini AI lê o texto como um humano — entende condições como <em>"6,59 acima de 36 unidades"</em>,
              validades, descontos e variações de formato. Use um produto por linha para melhores resultados.
            </p>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────────── */}
        {compared && products.length > 0 && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">

            {/* Summary banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Economia */}
              <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white p-6 rounded-[2rem] shadow-lg shadow-emerald-100">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-emerald-200" />
                  <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest">Economia Estimada</p>
                </div>
                <p className="text-3xl font-black">{fmt(stats?.totalSavings || 0)}</p>
                <p className="text-[10px] text-emerald-200 font-bold mt-1">
                  Comparando melhor vs pior preço por item
                </p>
              </div>

              {/* Total melhor preço */}
              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Melhor Preço</p>
                </div>
                <p className="text-3xl font-black text-blue-700">{fmt(stats?.totalBestPrice || 0)}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-1">Soma dos menores preços por produto</p>
              </div>

              {/* Fornecedor líder */}
              {stats?.topSupplierId && (() => {
                const sup = validSuppliers.find(s => s.id === stats.topSupplierId);
                const idx = getSupplierIndex(stats.topSupplierId);
                const colors = SUPPLIER_COLORS[idx % SUPPLIER_COLORS.length];
                return (
                  <div className={`${colors.light} p-6 rounded-[2rem] border ${colors.border} shadow-sm`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className={`w-5 h-5 ${colors.badge.split(' ')[1]}`} />
                      <p className={`text-[10px] font-black uppercase tracking-widest ${colors.badge.split(' ')[1]}`}>
                        Fornecedor Líder
                      </p>
                    </div>
                    <p className="text-xl font-black text-slate-900 truncate">{sup?.name || '—'}</p>
                    <p className="text-[10px] font-bold mt-1 text-slate-500">
                      Menor preço em {stats.topWins} produto(s)
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* ── Column-based Dashboard ───────────────────────────────── */}
            <div>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                Dashboard por Fornecedor
              </h3>

              <div className={`grid gap-4 ${
                validSuppliers.length <= 2 ? 'grid-cols-1 md:grid-cols-2' :
                validSuppliers.length === 3 ? 'grid-cols-1 md:grid-cols-3' :
                'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
              }`}>
                {validSuppliers.map((sup, idx) => {
                  const colors = SUPPLIER_COLORS[idx % SUPPLIER_COLORS.length];
                  const wins = stats?.wins[sup.id] || 0;
                  const supRes = supplierResults.find(r => r.supplierId === sup.id);
                  const supProductCount = supRes?.products.length || 0;

                  // Products this supplier has, sorted: best-price first
                  const supProducts = products
                    .map(p => ({ product: p, entry: getEntryForSupplier(p, sup.id) }))
                    .filter(({ entry }) => entry !== null);

                  // Sort: winners first
                  supProducts.sort((a, b) => {
                    const aWin = a.product.bestSupplierId === sup.id ? 0 : 1;
                    const bWin = b.product.bestSupplierId === sup.id ? 0 : 1;
                    return aWin - bWin;
                  });

                  return (
                    <div key={sup.id} className="bg-white rounded-[1.75rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                      {/* Column Header */}
                      <div className={`bg-gradient-to-r ${colors.header} p-5`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-white font-black text-base tracking-tight">{sup.name}</p>
                            <p className="text-white/70 text-[10px] font-bold mt-0.5">
                              {supProductCount} produto(s) na cotação
                            </p>
                          </div>
                          {wins > 0 && (
                            <div className="flex items-center gap-1 bg-white/20 px-2.5 py-1.5 rounded-xl">
                              <Trophy className="w-3.5 h-3.5 text-yellow-300" />
                              <span className="text-[11px] font-black text-white">{wins}</span>
                            </div>
                          )}
                        </div>
                        {/* Mini win percentage bar */}
                        {products.length > 0 && (
                          <div className="mt-3">
                            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-white/70 rounded-full transition-all duration-700"
                                style={{ width: `${Math.round((wins / products.length) * 100)}%` }}
                              />
                            </div>
                            <p className="text-[9px] text-white/60 font-bold mt-1">
                              {Math.round((wins / products.length) * 100)}% dos itens com menor preço
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Product cards */}
                      <div className="flex-1 p-3 space-y-2 max-h-[520px] overflow-y-auto">
                        {supProducts.length === 0 ? (
                          <div className="py-8 text-center">
                            <AlertCircle className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                            <p className="text-xs text-slate-300 font-bold">Sem produtos identificados</p>
                          </div>
                        ) : (
                          supProducts.map(({ product, entry }) => {
                            if (!entry) return null;
                            const isBest = product.bestSupplierId === sup.id;
                            const savings = product.worstPrice && product.bestPrice && !isBest
                              ? entry.price - product.bestPrice
                              : null;

                            return (
                              <div
                                key={product.name}
                                className={`relative rounded-xl p-3 border transition-all ${
                                  isBest
                                    ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300 shadow-sm shadow-emerald-100'
                                    : 'bg-slate-50 border-slate-100'
                                }`}
                              >
                                {/* Best price badge */}
                                {isBest && (
                                  <div className="absolute -top-2 -right-2 bg-emerald-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md">
                                    <Trophy className="w-3 h-3" />
                                  </div>
                                )}

                                {/* Product name */}
                                <p className={`font-black text-xs uppercase tracking-tight leading-tight ${
                                  isBest ? 'text-emerald-900' : 'text-slate-700'
                                }`}>
                                  {product.name}
                                </p>

                                {/* Price */}
                                <div className="flex items-center justify-between mt-1.5 flex-wrap gap-1">
                                  <span className={`text-lg font-black ${isBest ? 'text-emerald-700' : 'text-slate-800'}`}>
                                    {fmt(entry.price)}
                                  </span>
                                  {isBest && (
                                    <span className="text-[9px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                      ✓ Melhor preço
                                    </span>
                                  )}
                                  {savings !== null && savings > 0 && (
                                    <span className="text-[9px] font-bold text-red-500">
                                      +{fmt(savings)} vs best
                                    </span>
                                  )}
                                </div>

                                {/* Condition & Validity */}
                                <div className="mt-1.5 space-y-0.5">
                                  {entry.condition && (
                                    <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                                      <Package className="w-3 h-3" />
                                      {entry.condition}
                                    </p>
                                  )}
                                  {entry.validity && (
                                    <p className="text-[10px] text-slate-400 font-bold">
                                      Val: {entry.validity}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Footer */}
                      <div className={`px-4 py-3 border-t border-slate-100 ${colors.light}`}>
                        <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          <span>{supProducts.length} itens</span>
                          <span>{wins > 0 ? `🏆 ${wins} menor${wins !== 1 ? 'es' : ''}` : 'Nenhum líder'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Comparison Table (horizontal) ────────────────────────── */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                <Star className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-slate-900 uppercase tracking-tighter">
                  Tabela Cruzada de Preços
                </h3>
                <span className="ml-auto text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {products.length} produto(s) no total
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[200px]">
                        Produto
                      </th>
                      {validSuppliers.map((sup, idx) => {
                        const colors = SUPPLIER_COLORS[idx % SUPPLIER_COLORS.length];
                        const wins = stats?.wins[sup.id] || 0;
                        return (
                          <th key={sup.id} className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest min-w-[130px]">
                            <div className="flex flex-col items-center gap-1">
                              <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                              <span className="text-slate-600 truncate max-w-[110px]" title={sup.name}>
                                {sup.name || `Fornec. ${idx + 1}`}
                              </span>
                              {wins > 0 && (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${colors.badge}`}>
                                  {wins} menor{wins !== 1 ? 'es' : ''}
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((product, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3">
                          <span className="font-bold text-slate-900 text-sm uppercase tracking-tight">
                            {product.name}
                          </span>
                        </td>
                        {validSuppliers.map((sup) => {
                          const entry = getEntryForSupplier(product, sup.id);
                          const isBest = product.bestSupplierId === sup.id;
                          return (
                            <td key={sup.id} className="px-4 py-3 text-center">
                              {entry ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black transition-all ${
                                    isBest
                                      ? 'bg-emerald-100 text-emerald-700 shadow-sm ring-1 ring-emerald-300'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {isBest && <Trophy className="w-3 h-3 flex-shrink-0 text-emerald-600" />}
                                    {fmt(entry.price)}
                                  </div>
                                  {entry.condition && (
                                    <span className="text-[9px] text-slate-400 font-bold">{entry.condition}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-bold">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </section>
        )}

        {compared && products.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-400 uppercase text-sm">Nenhum produto identificado nos textos inseridos.</p>
            <p className="text-xs text-slate-300">
              Formate como: <code className="bg-slate-100 px-1 rounded">PRODUTO 3,50</code> ou{' '}
              <code className="bg-slate-100 px-1 rounded">PRODUTO R$ 12,90</code>
            </p>
          </div>
        )}

      </div>
    </div>
  );
};
