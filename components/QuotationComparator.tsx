
import React, { useState, useMemo } from 'react';
import {
  ArrowLeft, Plus, Trash2, BarChart3, TrendingDown,
  CheckCircle2, AlertCircle, Store, FileText, ChevronDown, ChevronUp
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  text: string;
}

interface ParsedItem {
  productName: string;
  price: number;
  rawLine: string;
}

interface ComparisonRow {
  productName: string;
  prices: Record<string, number | null>; // supplierId -> price
  bestSupplierId: string | null;
  bestPrice: number | null;
}

interface QuotationComparatorProps {
  onBack: () => void;
}

// ─── Helpers de parsing ──────────────────────────────────────────────────────

/** Normaliza texto: remove acentos, lowercase */
const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Tenta extrair pares (produto, preço) de um texto livre.
 * O texto pode ter formatos como:
 *  - "PRODUTO NOME 3,50"
 *  - "PRODUTO NOME R$ 3,50"
 *  - "PRODUTO NOME - 3.50"
 *  - "3,50 PRODUTO NOME"
 */
function parseQuotationText(text: string): ParsedItem[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results: ParsedItem[] = [];

  // Regex to find price pattern: optional R$, number with comma or dot as decimal
  const priceRegex = /R?\$?\s*(\d{1,6}[.,]\d{2})\b/g;

  for (const line of lines) {
    const matches = [...line.matchAll(priceRegex)];
    if (matches.length === 0) continue;

    // Pick the last price match in the line (most common pattern: name ... price)
    const lastMatch = matches[matches.length - 1];
    const priceStr = lastMatch[1].replace(',', '.');
    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) continue;

    // Product name = line with the price part removed
    const productName = line
      .replace(lastMatch[0], '')
      .replace(/R\$\s*/g, '')
      .replace(/^\d+[.,]\d+\s*/, '') // price at start
      .replace(/[-–—|*#]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (productName.length < 2) continue;

    results.push({ productName, price, rawLine: line });
  }

  return results;
}

/**
 * Compara dois nomes de produto com similaridade aproximada.
 * Usa a distância de Levenshtein simplificada para aceitar pequenas variações.
 */
function productSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Token overlap
  const tokensA = new Set(na.split(/\s+/).filter(t => t.length > 2));
  const tokensB = new Set(nb.split(/\s+/).filter(t => t.length > 2));
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

const SIMILARITY_THRESHOLD = 0.5;

function buildComparisonTable(suppliers: Supplier[]): ComparisonRow[] {
  // Parse all suppliers
  const parsed: { supplierId: string; items: ParsedItem[] }[] = suppliers
    .filter(s => s.name && s.text)
    .map(s => ({ supplierId: s.id, items: parseQuotationText(s.text) }));

  if (parsed.length === 0) return [];

  // Collect all unique products (merge similar names)
  const allProducts: { canonical: string; supplierId: string; price: number }[] = [];

  for (const { supplierId, items } of parsed) {
    for (const item of items) {
      allProducts.push({ canonical: item.productName, supplierId, price: item.price });
    }
  }

  // Group by product name similarity
  const groups: { canonical: string; entries: typeof allProducts }[] = [];

  for (const entry of allProducts) {
    let found = false;
    for (const group of groups) {
      if (productSimilarity(group.canonical, entry.canonical) >= SIMILARITY_THRESHOLD) {
        // Prefer longer name as canonical
        if (entry.canonical.length > group.canonical.length) {
          group.canonical = entry.canonical;
        }
        group.entries.push(entry);
        found = true;
        break;
      }
    }
    if (!found) {
      groups.push({ canonical: entry.canonical, entries: [entry] });
    }
  }

  // Build comparison rows
  return groups
    .filter(g => g.entries.length > 0)
    .map(group => {
      const prices: Record<string, number | null> = {};

      // For each supplier, find the best (lowest) price for this product
      for (const sup of suppliers) {
        const supEntries = group.entries.filter(e => e.supplierId === sup.id);
        if (supEntries.length > 0) {
          prices[sup.id] = Math.min(...supEntries.map(e => e.price));
        } else {
          prices[sup.id] = null;
        }
      }

      // Find best supplier (lowest price, ignoring nulls)
      let bestSupplierId: string | null = null;
      let bestPrice: number | null = null;

      for (const [supplierId, price] of Object.entries(prices)) {
        if (price !== null && (bestPrice === null || price < bestPrice)) {
          bestPrice = price;
          bestSupplierId = supplierId;
        }
      }

      return {
        productName: group.canonical,
        prices,
        bestSupplierId,
        bestPrice,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

// ─── Component ───────────────────────────────────────────────────────────────

const INITIAL_SUPPLIERS: Supplier[] = [
  { id: 'sup1', name: '', text: '' },
  { id: 'sup2', name: '', text: '' },
];

const SUPPLIER_COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
];

const SUPPLIER_LIGHT_COLORS = [
  'bg-blue-50 border-blue-200 text-blue-700',
  'bg-violet-50 border-violet-200 text-violet-700',
  'bg-emerald-50 border-emerald-200 text-emerald-700',
  'bg-amber-50 border-amber-200 text-amber-700',
  'bg-rose-50 border-rose-200 text-rose-700',
];

export const QuotationComparator: React.FC<QuotationComparatorProps> = ({ onBack }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [compared, setCompared] = useState(false);
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [rows, setRows] = useState<ComparisonRow[]>([]);

  const validSuppliers = suppliers.filter(s => s.name && s.text);

  const handleAddSupplier = () => {
    if (suppliers.length >= 5) return;
    setSuppliers(prev => [
      ...prev,
      { id: `sup${Date.now()}`, name: '', text: '' },
    ]);
  };

  const handleRemoveSupplier = (id: string) => {
    setSuppliers(prev => prev.filter(s => s.id !== id));
    setCompared(false);
  };

  const handleChange = (id: string, field: 'name' | 'text', value: string) => {
    setSuppliers(prev =>
      prev.map(s => (s.id === id ? { ...s, [field]: value } : s))
    );
    setCompared(false);
  };

  const handleCompare = () => {
    const result = buildComparisonTable(suppliers);
    setRows(result);
    setCompared(true);
  };

  // Savings summary
  const savings = useMemo(() => {
    if (!compared || rows.length === 0) return null;
    const totalBest = rows.reduce((acc, r) => acc + (r.bestPrice || 0), 0);
    return { totalBest };
  }, [compared, rows]);

  // Wins per supplier
  const wins = useMemo(() => {
    if (!compared) return {};
    const w: Record<string, number> = {};
    for (const row of rows) {
      if (row.bestSupplierId) {
        w[row.bestSupplierId] = (w[row.bestSupplierId] || 0) + 1;
      }
    }
    return w;
  }, [compared, rows]);

  const topSupplier = useMemo(() => {
    if (!compared) return null;
    let best: { id: string; wins: number } | null = null;
    const winsTyped = wins as Record<string, number>;
    for (const [id, count] of Object.entries(winsTyped)) {
      if (!best || count > best.wins) best = { id, wins: count };
    }
    return best;
  }, [wins, compared]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm px-6 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-red-500" />
            Comparador de Cotações
          </h1>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
            Cole os textos de cada fornecedor e compare os melhores preços
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">

        {/* Supplier cards */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              Fornecedores ({suppliers.length}/5)
            </h2>
            {suppliers.length < 5 && (
              <button
                onClick={handleAddSupplier}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 rounded-xl font-bold text-xs hover:opacity-90 transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Fornecedor
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {suppliers.map((sup, idx) => {
              const colorDot = SUPPLIER_COLORS[idx % SUPPLIER_COLORS.length];
              const isExpanded = expandedSupplier === sup.id;
              const parsedCount = sup.text ? parseQuotationText(sup.text).length : 0;

              return (
                <div
                  key={sup.id}
                  className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
                >
                  {/* Card Header */}
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${colorDot} flex-shrink-0`} />
                    <input
                      type="text"
                      placeholder={`Nome do Fornecedor ${idx + 1}`}
                      value={sup.name}
                      onChange={e => handleChange(sup.id, 'name', e.target.value)}
                      className="flex-1 text-sm font-black text-slate-900 dark:text-slate-100 bg-transparent outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                    />
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {parsedCount > 0 && (
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                          {parsedCount} itens
                        </span>
                      )}
                      <button
                        onClick={() => setExpandedSupplier(isExpanded ? null : sup.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      {suppliers.length > 2 && (
                        <button
                          onClick={() => handleRemoveSupplier(sup.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Textarea */}
                  <div className={`transition-all duration-300 ${isExpanded ? 'max-h-none' : 'max-h-36'} overflow-hidden`}>
                    <textarea
                      rows={isExpanded ? 14 : 5}
                      placeholder={`Cole aqui o texto da cotação do fornecedor...\n\nExemplo:\nDIPIRONA 500MG 3,50\nAMOXICILINA 250MG R$ 12,90\nVITAMINA C 500MG - 4,80`}
                      value={sup.text}
                      onChange={e => handleChange(sup.id, 'text', e.target.value)}
                      className="w-full p-5 text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 outline-none resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 placeholder:font-sans leading-relaxed"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Compare Button */}
        <div className="flex justify-center">
          <button
            onClick={handleCompare}
            disabled={validSuppliers.length < 2}
            className="flex items-center gap-3 px-12 py-5 bg-red-600 text-white rounded-[2rem] font-black uppercase tracking-widest text-sm shadow-xl shadow-red-100 hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <BarChart3 className="w-5 h-5" />
            Comparar Cotações
            {validSuppliers.length >= 2 && (
              <span className="bg-red-500 px-2 py-0.5 rounded-lg text-[10px]">
                {validSuppliers.length} fornecedores
              </span>
            )}
          </button>
        </div>

        {/* Results */}
        {compared && rows.length > 0 && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Total best */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Total Melhor Preço
                </p>
                <p className="text-2xl font-black text-emerald-600">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(savings?.totalBest || 0)}
                </p>
                <p className="text-[10px] text-slate-400 font-bold mt-1">Soma dos menores preços</p>
              </div>

              {/* Products found */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Produtos Encontrados
                </p>
                <p className="text-2xl font-black text-blue-600">{rows.length}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-1">Itens identificados nos textos</p>
              </div>

              {/* Best supplier */}
              {topSupplier && (
                <div className="bg-emerald-50 dark:bg-emerald-900/10 p-6 rounded-[2rem] border border-emerald-200 dark:border-emerald-800 shadow-sm">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" /> Melhor Fornecedor
                  </p>
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 truncate">
                    {suppliers.find(s => s.id === topSupplier.id)?.name || '—'}
                  </p>
                  <p className="text-[10px] text-emerald-500 font-bold mt-1">
                    Menor preço em {topSupplier.wins} item(s)
                  </p>
                </div>
              )}
            </div>

            {/* Comparison table */}
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <FileText className="w-5 h-5 text-slate-400" />
                <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">
                  Tabela Comparativa de Preços
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[200px]">
                        Produto
                      </th>
                      {suppliers.map((sup, idx) => (
                        <th key={sup.id} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-center min-w-[120px]">
                          <div className="flex flex-col items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${SUPPLIER_COLORS[idx % SUPPLIER_COLORS.length]}`} />
                            <span className="text-slate-500 truncate max-w-[110px]" title={sup.name || `Fornecedor ${idx + 1}`}>
                              {sup.name || `Fornec. ${idx + 1}`}
                            </span>
                            {wins[sup.id] !== undefined && (
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${SUPPLIER_LIGHT_COLORS[idx % SUPPLIER_LIGHT_COLORS.length]}`}>
                                {wins[sup.id]} menor{wins[sup.id] !== 1 ? 'es' : ''}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((row, i) => (
                      <tr
                        key={i}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-6 py-3">
                          <span className="font-bold text-slate-900 dark:text-slate-100 text-sm uppercase tracking-tight">
                            {row.productName}
                          </span>
                        </td>
                        {suppliers.map((sup) => {
                          const price = row.prices[sup.id];
                          const isBest = row.bestSupplierId === sup.id;
                          const hasPrice = price !== null;

                          return (
                            <td key={sup.id} className="px-4 py-3 text-center">
                              {hasPrice ? (
                                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black transition-all ${
                                  isBest
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 shadow-sm ring-1 ring-emerald-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                }`}>
                                  {isBest && <CheckCircle2 className="w-3 h-3 flex-shrink-0" />}
                                  {new Intl.NumberFormat('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                  }).format(price!)}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-300 dark:text-slate-600 font-bold">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rows.length === 0 && (
                <div className="py-16 text-center">
                  <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-400">
                    Nenhum produto identificado. Verifique o formato dos textos inseridos.
                  </p>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-1">
                  Como funciona o parsing de texto
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium leading-relaxed">
                  O sistema lê cada linha do texto e busca padrões de preço (ex: <code className="bg-amber-100 px-1 rounded">3,50</code> ou <code className="bg-amber-100 px-1 rounded">R$ 12,90</code>).
                  O restante da linha é considerado o nome do produto. Produtos com nomes semelhantes entre fornecedores são agrupados automaticamente.
                  Para melhores resultados, use <strong>um produto por linha</strong>.
                </p>
              </div>
            </div>
          </section>
        )}

        {compared && rows.length === 0 && (
          <div className="text-center py-16">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-4" />
            <p className="font-bold text-slate-400 uppercase text-sm">
              Nenhum produto identificado nos textos inseridos.
            </p>
            <p className="text-xs text-slate-300 mt-2">
              Verifique se os textos possuem preços no formato: <code>PRODUTO 3,50</code> ou <code>PRODUTO R$ 12,90</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
