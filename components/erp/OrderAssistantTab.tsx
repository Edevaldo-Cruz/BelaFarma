import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  FileText,
  ShoppingCart,
  Printer,
  RefreshCw,
  Pill,
  CheckCircle2,
  User as UserIcon,
  Clock,
  XCircle,
  Package
} from 'lucide-react';
import { useToast } from '../ToastContext';
import { imprimirComprovanteOrcamento } from '../../utils/thermalPrinter';
import { PosologyProductRef } from './ProductPosologyModal';

export interface AssistantDraftItem {
  code: string;
  barcode: string;
  name: string;
  presentation?: string;
  unit_price: number;
  sale_price: number;
  promo_price: number;
  crediario_price: number;
  promo_vista?: string;
  unit_cost: number;
  stock_qty: number;
  quantity: number;
  rawProduct: any;
}

interface OrderAssistantTabProps {
  preSalesList: any[];
  isLoadingPreSales: boolean;
  operatorName: string;
  sellerId?: string | null;
  onRefreshPreSales: () => void;
  onConvertDraftToSale: (items: AssistantDraftItem[], customerName: string) => void;
  onConvertPreSaleToSale: (preSale: any) => Promise<void>;
  onCancelPreSale: (preSaleId: string) => Promise<void>;
  onOpenPosology: (prod: PosologyProductRef) => void;
}

function getCashUnitPrice(prod: any): number {
  const sale = Math.max(0, Number(prod?.sale_price || 0));
  const promo = Math.max(0, Number(prod?.promo_price || 0));
  return promo > 0 ? promo : sale;
}

function getCrediarioUnitPrice(prod: any): number {
  const sale = Math.max(0, Number(prod?.sale_price || 0));
  const promo = Math.max(0, Number(prod?.promo_price || 0));
  const cred = Math.max(0, Number(prod?.crediario_price || 0));
  const promoVista = String(prod?.promo_vista || '').toUpperCase() === 'S';
  const cash = getCashUnitPrice(prod);
  if (cred > 0) return Math.max(cash, cred);
  if (promo > 0 && promoVista && sale > 0) return Math.max(cash, sale);
  return cash;
}

export const OrderAssistantTab: React.FC<OrderAssistantTabProps> = ({
  preSalesList,
  isLoadingPreSales,
  operatorName,
  sellerId,
  onRefreshPreSales,
  onConvertDraftToSale,
  onConvertPreSaleToSale,
  onCancelPreSale,
  onOpenPosology
}) => {
  const { addToast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [qtyDraftByCode, setQtyDraftByCode] = useState<Record<string, number>>({});

  // Itens do orçamento em montagem
  const [draftItems, setDraftItems] = useState<AssistantDraftItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [isSavingQuote, setIsSavingQuote] = useState(false);

  // Busca inicial de produtos mais vendidos ao abrir a guia
  useEffect(() => {
    searchRef.current?.focus();
    onRefreshPreSales();
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/erp/products?q=${encodeURIComponent(query.trim())}&limit=30`);
        if (res.ok) {
          const json = await res.json();
          setResults(Array.isArray(json.products) ? json.products : Array.isArray(json.data) ? json.data : []);
        }
      } catch (_) {
      } finally {
        setIsSearching(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const getRowQty = (code: string) => Math.max(1, Number(qtyDraftByCode[code] || 1));

  const setRowQty = (code: string, next: number) => {
    const safe = Math.max(1, Math.min(999, Math.floor(Number(next) || 1)));
    setQtyDraftByCode(prev => ({ ...prev, [code]: safe }));
  };

  const handleAddToDraft = (prod: any) => {
    const cleanCode = String(prod.code || '').trim().replace(/\.0+$/, '');
    const qtyToAdd = getRowQty(cleanCode);
    const cashPrice = getCashUnitPrice(prod);

    setDraftItems(prev => {
      const existingIdx = prev.findIndex(it => it.code === cleanCode);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + qtyToAdd
        };
        return updated;
      }
      return [
        ...prev,
        {
          code: cleanCode,
          barcode: String(prod.barcode || '').trim(),
          name: String(prod.name || '').trim(),
          presentation: String(prod.presentation || '').trim(),
          unit_price: cashPrice,
          sale_price: Number(prod.sale_price || 0),
          promo_price: Number(prod.promo_price || 0),
          crediario_price: Number(prod.crediario_price || 0),
          promo_vista: prod.promo_vista || 'N',
          unit_cost: Number(prod.cost_price || 0),
          stock_qty: Number(prod.stock_qty || 0),
          quantity: qtyToAdd,
          rawProduct: prod
        }
      ];
    });

    setQtyDraftByCode(prev => ({ ...prev, [cleanCode]: 1 }));
    addToast(`+${qtyToAdd}x ${prod.name} adicionado ao orçamento!`, 'success', 1600);
  };

  const handleUpdateDraftQty = (code: string, nextQty: number) => {
    const safe = Math.max(1, Math.min(999, Math.floor(Number(nextQty) || 1)));
    setDraftItems(prev => prev.map(it => (it.code === code ? { ...it, quantity: safe } : it)));
  };

  const handleRemoveDraftItem = (code: string) => {
    setDraftItems(prev => prev.filter(it => it.code !== code));
  };

  const totals = useMemo(() => {
    let totalCash = 0;
    let totalCred = 0;
    let totalUnits = 0;
    for (const it of draftItems) {
      totalCash += it.unit_price * it.quantity;
      totalCred += getCrediarioUnitPrice(it) * it.quantity;
      totalUnits += it.quantity;
    }
    return {
      totalCash: Math.round(totalCash * 100) / 100,
      totalCred: Math.round(totalCred * 100) / 100,
      totalUnits
    };
  }, [draftItems]);

  const handleSaveQuote = async (shouldPrint = true) => {
    if (draftItems.length === 0) {
      addToast('Adicione pelo menos um item para gerar o orçamento.', 'warning');
      return;
    }
    setIsSavingQuote(true);
    try {
      const payloadItems = draftItems.map(it => ({
        code: it.code,
        barcode: it.barcode,
        name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        unit_cost: it.unit_cost,
        discount: 0,
        total_price: Math.round(it.unit_price * it.quantity * 100) / 100
      }));

      const res = await fetch('/api/erp/pos/pre-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: payloadItems,
          total_items_value: totals.totalCash,
          discount_value: 0,
          total_value: totals.totalCash,
          customer_name: customerName.trim() || 'Balcão (Orçamento)',
          seller_id: sellerId || null,
          seller_name: operatorName,
          notes: notes.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao salvar orçamento.');
      }

      const shortCode = data.short_code || data.pre_sale_id;
      addToast(`Orçamento #${shortCode} gerado com sucesso!`, 'success', 3500);

      if (shouldPrint) {
        try {
          imprimirComprovanteOrcamento({
            id: data.pre_sale_id || String(shortCode),
            short_code: data.short_code,
            customer_name: customerName.trim() || 'Balcão',
            seller_name: operatorName,
            date: new Date().toLocaleDateString('pt-BR'),
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            items: payloadItems.map(i => ({
              name: i.name,
              quantity: i.quantity,
              unit_price: i.unit_price,
              total_price: i.total_price
            })),
            total_items_value: totals.totalCash,
            discount_value: 0,
            total_value: totals.totalCash
          });
        } catch (_) {}
      }

      setDraftItems([]);
      setCustomerName('');
      setNotes('');
      onRefreshPreSales();
    } catch (err: any) {
      addToast(err?.message || 'Erro ao gerar orçamento.', 'error');
    } finally {
      setIsSavingQuote(false);
    }
  };

  const handleConvertNow = () => {
    if (draftItems.length === 0) {
      addToast('Adicione pelo menos um item para transformar em venda.', 'warning');
      return;
    }
    onConvertDraftToSale(draftItems, customerName.trim());
    setDraftItems([]);
    setCustomerName('');
    setNotes('');
  };

  return (
    <main className="flex-1 flex flex-col lg:flex-row gap-3 p-3 overflow-hidden min-h-0 bg-slate-100">
      {/* COLUNA ESQUERDA: PESQUISA DE PRODUTOS + QUANTIDADE */}
      <section className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden min-h-0">
        <div className="px-4 py-3 bg-gradient-to-r from-[#0b2545] to-[#0f3460] text-white flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" />
              <span>Assistente de Pedido & Orçamento</span>
            </h2>
            <p className="text-[11px] text-slate-300">
              Pesquise os produtos, defina a quantidade de cada item e gere o orçamento ou transforme direto em venda.
            </p>
          </div>
          <span className="text-[11px] font-mono bg-white/10 px-2.5 py-1 rounded-lg border border-white/20">
            {results.length} produto(s)
          </span>
        </div>

        <div className="p-3 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Pesquisar produto por nome, marca, princípio ativo ou código de barras..."
              className="w-full pl-9 pr-10 py-2 bg-white border-2 border-slate-300 focus:border-[#0f3460] rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none"
            />
            {isSearching && (
              <RefreshCw className="w-4 h-4 animate-spin text-[#0f3460] absolute right-3 top-2.5" />
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-100 border-b border-slate-300 text-[10px] font-black uppercase tracking-wider text-slate-600 z-10">
              <tr>
                <th className="py-2 px-3 whitespace-nowrap">Produto</th>
                <th className="py-2 px-2 text-right whitespace-nowrap">Estoque</th>
                <th className="py-2 px-2 text-right whitespace-nowrap">À Vista</th>
                <th className="py-2 px-2 text-center whitespace-nowrap">Qtd</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {results.length === 0 && !isSearching ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    Nenhum produto encontrado. Digite o nome ou código de barras acima.
                  </td>
                </tr>
              ) : (
                results.map(prod => {
                  const cleanCode = String(prod.code || '').trim().replace(/\.0+$/, '');
                  const cashPrice = getCashUnitPrice(prod);
                  const credPrice = getCrediarioUnitPrice(prod);
                  const rowQty = getRowQty(cleanCode);
                  const inStock = Number(prod.stock_qty || 0) > 0;

                  return (
                    <tr key={cleanCode} className="hover:bg-blue-50/50 transition-colors">
                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-900 leading-tight">{prod.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono inline-flex items-center gap-1.5 mt-0.5">
                          <span>Cód: {cleanCode}</span>
                          {prod.barcode && <span>• EAN: {prod.barcode}</span>}
                          {credPrice > cashPrice + 0.004 && (
                            <span className="text-amber-700 font-sans font-bold">
                              • Crediário: R$ {credPrice.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 rounded font-black text-[11px] ${
                            inStock ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {Number(prod.stock_qty || 0)}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                        R$ {cashPrice.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <div className="inline-flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setRowQty(cleanCode, rowQty - 1)}
                            aria-label="Diminuir quantidade"
                            className="px-1.5 py-1 hover:bg-slate-100 text-slate-700 cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={rowQty}
                            onChange={e => setRowQty(cleanCode, parseInt(e.target.value, 10) || 1)}
                            aria-label={`Quantidade de ${prod.name}`}
                            className="w-11 text-center font-mono font-black text-xs py-1 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setRowQty(cleanCode, rowQty + 1)}
                            aria-label="Aumentar quantidade"
                            className="px-1.5 py-1 hover:bg-slate-100 text-slate-700 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenPosology({
                                code: cleanCode,
                                barcode: prod.barcode,
                                name: prod.name
                              })
                            }
                            title="Ver posologia e princípio ativo"
                            className="p-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 cursor-pointer"
                          >
                            <Pill className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddToDraft(prod)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#0f3460] hover:bg-[#14437a] text-white font-black text-[11px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Orçar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* COLUNA DIREITA: ORÇAMENTO EM MONTAGEM + ORÇAMENTOS SALVOS */}
      <aside className="w-full lg:w-[430px] xl:w-[470px] flex flex-col gap-3 min-h-0 shrink-0">
        {/* Card 1: Orçamento em Montagem */}
        <div className="bg-white rounded-2xl border-2 border-indigo-300 shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">
          <div className="px-4 py-2.5 bg-indigo-950 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-300" />
              <span className="font-black text-xs uppercase tracking-wider">
                Orçamento em Montagem ({draftItems.length} item(ns))
              </span>
            </div>
            {draftItems.length > 0 && (
              <button
                type="button"
                onClick={() => setDraftItems([])}
                className="text-[11px] text-rose-300 hover:text-rose-200 font-bold cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Cliente e Observação */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
            <div className="relative">
              <UserIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Nome do cliente (opcional)"
                className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:border-indigo-500"
              />
            </div>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observação (ex: entrega, receita)"
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Itens do Orçamento */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-200 px-3">
            {draftItems.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 space-y-1">
                <FileText className="w-7 h-7 mx-auto opacity-40" />
                <p className="font-bold text-slate-500">Nenhum item no orçamento ainda</p>
                <p>Pesquise à esquerda, informe a quantidade e clique em &ldquo;Orçar&rdquo;.</p>
              </div>
            ) : (
              draftItems.map(it => (
                <div key={it.code} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900 truncate">{it.name}</div>
                    <div className="text-[10px] font-mono text-slate-500">
                      Unit: R$ {it.unit_price.toFixed(2)} • Sub:{' '}
                      <strong className="text-slate-800">R$ {(it.unit_price * it.quantity).toFixed(2)}</strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="inline-flex items-center border border-slate-300 rounded-lg bg-slate-50 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleUpdateDraftQty(it.code, it.quantity - 1)}
                        className="px-1.5 py-1 hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={it.quantity}
                        onChange={e => handleUpdateDraftQty(it.code, parseInt(e.target.value, 10) || 1)}
                        className="w-10 text-center font-mono font-black text-xs bg-white py-1 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateDraftQty(it.code, it.quantity + 1)}
                        className="px-1.5 py-1 hover:bg-slate-200 text-slate-700 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDraftItem(it.code)}
                      title="Remover item"
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totais + Botões de Ação */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-2.5 shrink-0">
            <div className="flex items-end justify-between">
              <div className="text-[11px] text-slate-600">
                <div>{totals.totalUnits} unidade(s)</div>
                {totals.totalCred > totals.totalCash + 0.01 && (
                  <div className="text-amber-700 font-bold">
                    No Crediário: R$ {totals.totalCred.toFixed(2)}
                  </div>
                )}
              </div>
              <div className="text-right">
                <span className="block text-[10px] uppercase font-bold text-slate-500">Total do Orçamento</span>
                <strong className="text-2xl font-black font-mono text-[#0b2545]">
                  R$ {totals.totalCash.toFixed(2)}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={draftItems.length === 0 || isSavingQuote}
                onClick={() => handleSaveQuote(true)}
                className="py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{isSavingQuote ? 'Salvando...' : 'Gerar Orçamento'}</span>
              </button>
              <button
                type="button"
                disabled={draftItems.length === 0}
                onClick={handleConvertNow}
                className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Transformar em Venda</span>
              </button>
            </div>
          </div>
        </div>

        {/* Card 2: Orçamentos Salvos em Aberto (1 clique para transformar em venda) */}
        <div className="bg-white rounded-2xl border border-slate-300 shadow-sm flex flex-col overflow-hidden max-h-[250px] shrink-0">
          <div className="px-3.5 py-2 bg-slate-800 text-white flex items-center justify-between shrink-0">
            <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Orçamentos em Aberto ({preSalesList.length})</span>
            </span>
            <button
              type="button"
              onClick={onRefreshPreSales}
              className="p-1 rounded hover:bg-white/10 text-slate-300 cursor-pointer"
              title="Atualizar lista de orçamentos"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPreSales ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-200 p-2 space-y-1">
            {preSalesList.length === 0 ? (
              <p className="py-5 text-center text-xs text-slate-400">
                Nenhum orçamento salvo em aberto.
              </p>
            ) : (
              preSalesList.map(ps => (
                <div
                  key={ps.id}
                  className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 truncate flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-[10px]">
                        #{ps.short_code || String(ps.id).slice(-4)}
                      </span>
                      <span className="truncate">{ps.customer_name || 'Balcão'}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {Array.isArray(ps.items) ? `${ps.items.length} item(ns)` : 'Itens'} •{' '}
                      <strong className="font-mono text-slate-800">
                        R$ {Number(ps.total_value || 0).toFixed(2)}
                      </strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onConvertPreSaleToSale(ps)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] flex items-center gap-1 cursor-pointer"
                      title="Carregar orçamento no carrinho do PDV para finalizar venda"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Vender</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onCancelPreSale(ps.id)}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 cursor-pointer"
                      title="Cancelar orçamento"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </main>
  );
};

export default OrderAssistantTab;
