import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Barcode, 
  Search, 
  ShoppingCart, 
  Trash2, 
  CreditCard, 
  Banknote, 
  QrCode, 
  BookOpen, 
  CheckCircle2, 
  X, 
  Printer, 
  AlertCircle,
  Plus,
  Minus,
  RefreshCw,
  Clock,
  User,
  DollarSign
} from 'lucide-react';
import { useToast } from '../ToastContext';

interface CartItem {
  code: string;
  barcode: string;
  name: string;
  unit_price: number;
  unit_cost: number;
  quantity: number;
  total_price: number;
}

interface PaymentOption {
  method: 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX' | 'CREDIARIO';
  amount: number;
  change_amount?: number;
  card_brand?: string;
  installments?: number;
  due_date?: string;
}

interface ProductSearchResult {
  code: string;
  barcode: string;
  name: string;
  sale_price: number;
  promo_price: number;
  cost_price: number;
  stock_qty: number;
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string;
}

export const BelinhaPDV: React.FC = () => {
  const { addToast } = useToast();

  // Estados do Carrinho
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Modais
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);

  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX' | 'CREDIARIO'>('DINHEIRO');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [cardBrand, setCardBrand] = useState('MASTERCARD');
  const [installments, setInstallments] = useState<number>(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [customersList, setCustomersList] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');

  // Cupom Concluído
  const [completedSale, setCompletedSale] = useState<any | null>(null);

  // Refs de Foco
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Foco automático no input de bipagem
  const focusBarcodeInput = useCallback(() => {
    if (!isSearchOpen && !isPaymentOpen && !completedSale) {
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    }
  }, [isSearchOpen, isPaymentOpen, completedSale]);

  useEffect(() => {
    focusBarcodeInput();
  }, [focusBarcodeInput]);

  // Carregar lista de clientes para crediário
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await fetch('/api/customers');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setCustomersList(data.map((c: any) => ({ id: c.id, name: c.name, phone: c.phone || '' })));
          }
        }
      } catch (e) {}
    };
    fetchCustomers();
  }, []);

  // Atalhos de teclado globais do PDV
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2 -> Abrir Pesquisa de Produtos
      if (e.key === 'F2') {
        e.preventDefault();
        setIsSearchOpen(true);
        setIsPaymentOpen(false);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      // F10 -> Finalizar Venda
      else if (e.key === 'F10') {
        e.preventDefault();
        if (cart.length > 0) {
          setIsPaymentOpen(true);
          setIsSearchOpen(false);
        } else {
          addToast('Adicione pelo menos um produto ao carrinho antes de finalizar.', 'warning');
        }
      }
      // ESC -> Fechar modais ou limpar carrinho
      else if (e.key === 'Escape') {
        if (isSearchOpen) {
          setIsSearchOpen(false);
          focusBarcodeInput();
        } else if (isPaymentOpen) {
          setIsPaymentOpen(false);
          focusBarcodeInput();
        } else if (completedSale) {
          setCompletedSale(null);
          focusBarcodeInput();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, isSearchOpen, isPaymentOpen, completedSale, addToast, focusBarcodeInput]);

  // Totais calculados
  const subtotal = cart.reduce((acc, it) => acc + it.total_price, 0);
  const totalFinal = Math.max(0, subtotal - discount);
  const totalQuantity = cart.reduce((acc, it) => acc + it.quantity, 0);

  // Troco em dinheiro
  const cashNum = parseFloat(cashReceived.replace(',', '.')) || 0;
  const cashChange = selectedMethod === 'DINHEIRO' ? Math.max(0, cashNum - totalFinal) : 0;

  // Bipagem de produto (Enter no input)
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = barcodeInput.trim();
    if (!raw) return;

    // Suporte para multiplicador: ex: "3*789..." ou "5*186276"
    let multiplier = 1;
    let codeToSearch = raw;
    if (raw.includes('*')) {
      const parts = raw.split('*');
      if (parts.length === 2 && !isNaN(Number(parts[0])) && Number(parts[0]) > 0) {
        multiplier = parseFloat(parts[0]);
        codeToSearch = parts[1].trim();
      }
    }

    try {
      const res = await fetch(`/api/erp/products/${encodeURIComponent(codeToSearch)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          addItemToCart(json.data, multiplier);
          setBarcodeInput('');
          focusBarcodeInput();
          return;
        }
      }

      // Se não achou exato pelo endpoint direto, tenta a busca rápida
      const searchRes = await fetch(`/api/erp/products?q=${encodeURIComponent(codeToSearch)}&limit=1`);
      if (searchRes.ok) {
        const searchJson = await searchRes.json();
        if (searchJson.success && searchJson.data && searchJson.data.length > 0) {
          addItemToCart(searchJson.data[0], multiplier);
          setBarcodeInput('');
          focusBarcodeInput();
          return;
        }
      }

      addToast(`Produto não encontrado com o código "${codeToSearch}".`, 'error');
    } catch (err: any) {
      addToast('Erro ao consultar produto.', 'error');
    }
  };

  // Adiciona produto ao carrinho
  const addItemToCart = (prod: ProductSearchResult, qty: number = 1) => {
    const effectivePrice = prod.promo_price > 0 ? prod.promo_price : prod.sale_price;
    const costPrice = prod.cost_price || 0;

    setCart(prev => {
      const existingIdx = prev.findIndex(it => it.code === prod.code);
      if (existingIdx >= 0) {
        const copy = [...prev];
        const newQty = copy[existingIdx].quantity + qty;
        copy[existingIdx] = {
          ...copy[existingIdx],
          quantity: newQty,
          total_price: Math.round(newQty * effectivePrice * 100) / 100
        };
        return copy;
      } else {
        return [
          ...prev,
          {
            code: prod.code,
            barcode: prod.barcode,
            name: prod.name,
            unit_price: effectivePrice,
            unit_cost: costPrice,
            quantity: qty,
            total_price: Math.round(qty * effectivePrice * 100) / 100
          }
        ];
      }
    });

    addToast(`${qty}x ${prod.name.substring(0, 25)}... adicionado!`, 'success', 2000);
  };

  // Remover item
  const handleRemoveItem = (index: number) => {
    setCart(prev => prev.filter((_, idx) => idx !== index));
    focusBarcodeInput();
  };

  // Alterar quantidade manualmente
  const handleUpdateQuantity = (index: number, delta: number) => {
    setCart(prev => {
      const copy = [...prev];
      const newQty = Math.max(1, copy[index].quantity + delta);
      copy[index] = {
        ...copy[index],
        quantity: newQty,
        total_price: Math.round(newQty * copy[index].unit_price * 100) / 100
      };
      return copy;
    });
  };

  // Busca de produtos por nome [F2]
  const handleSearchByName = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchingProducts(true);
    try {
      const res = await fetch(`/api/erp/products?q=${encodeURIComponent(searchQuery.trim())}&limit=25`);
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.data || []);
      }
    } catch (e) {
      addToast('Erro ao buscar produtos.', 'error');
    } finally {
      setIsSearchingProducts(false);
    }
  };

  // Finalizar a venda
  const handleConfirmCheckout = async () => {
    if (cart.length === 0) return;

    if (selectedMethod === 'DINHEIRO') {
      if (cashNum < totalFinal) {
        addToast(`Valor em dinheiro (R$ ${cashNum.toFixed(2)}) é menor que o total da venda.`, 'warning');
        return;
      }
    }

    if (selectedMethod === 'CREDIARIO' && !selectedCustomer) {
      addToast('Selecione o cliente para lançar no Crediário.', 'warning');
      return;
    }

    setIsProcessing(true);
    try {
      const paymentPayload: PaymentOption = {
        method: selectedMethod,
        amount: totalFinal,
        change_amount: selectedMethod === 'DINHEIRO' ? cashChange : 0,
        card_brand: ['CARTAO_DEBITO', 'CARTAO_CREDITO'].includes(selectedMethod) ? cardBrand : undefined,
        installments: selectedMethod === 'CARTAO_CREDITO' ? installments : 1
      };

      const payload = {
        items: cart.map(it => ({
          code: it.code,
          barcode: it.barcode,
          product_name: it.name,
          quantity: it.quantity,
          unit_price: it.unit_price,
          unit_cost: it.unit_cost
        })),
        payments: [
          {
            payment_method: paymentPayload.method,
            amount: paymentPayload.amount,
            change_amount: paymentPayload.change_amount,
            card_brand: paymentPayload.card_brand,
            installments: paymentPayload.installments
          }
        ],
        customer_id: selectedCustomer ? selectedCustomer.id : null,
        customer_name: selectedCustomer ? selectedCustomer.name : null,
        discount_value: discount,
        user_name: 'Balcão'
      };

      const res = await fetch('/api/erp/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setCompletedSale({
          sale_id: json.sale_id,
          date: json.sale_date,
          time: json.sale_time,
          items: cart,
          total_items_value: subtotal,
          discount_value: discount,
          total_final: totalFinal,
          payment: paymentPayload,
          customer_name: selectedCustomer?.name,
          change: cashChange
        });

        // Limpar carrinho e fechar modal
        setCart([]);
        setDiscount(0);
        setCashReceived('');
        setSelectedCustomer(null);
        setIsPaymentOpen(false);

        addToast('Venda finalizada com sucesso!', 'success');
      } else {
        addToast(json.error || 'Erro ao registrar venda.', 'error');
      }
    } catch (err: any) {
      addToast('Erro na comunicação com o servidor.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-3 sm:p-5">
      {/* 1. TOPO: Status do Caixa & Atalhos */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Belinha PDV • Frente de Caixa
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
                Caixa Aberto
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Operação física autônoma e de alta velocidade (Sem dependência do Digifarma)
            </p>
          </div>
        </div>

        {/* Atalhos Rápidos */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsSearchOpen(true);
              setTimeout(() => searchInputRef.current?.focus(), 100);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all shadow-sm"
          >
            <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[10px] font-black">F2</kbd>
            <Search className="w-3.5 h-3.5" />
            Buscar Produto
          </button>

          <button
            onClick={() => {
              if (cart.length > 0) setIsPaymentOpen(true);
              else addToast('Carrinho vazio.', 'warning');
            }}
            disabled={cart.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm"
          >
            <kbd className="px-1.5 py-0.5 rounded bg-emerald-800 text-[10px] font-black text-white">F10</kbd>
            <CheckCircle2 className="w-3.5 h-3.5" />
            Finalizar Venda
          </button>
        </div>
      </div>

      {/* 2. ÁREA CENTRAL: BIPAGEM + TABELA + PAINEL DE TOTAIS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        
        {/* COLUNA ESQUERDA: BIPAGEM E ITENS (8 COLUNAS) */}
        <div className="lg:col-span-8 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          
          {/* BARRA DE BIPAGEM RÁPIDA */}
          <div className="p-3 sm:p-4 bg-slate-100/70 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800">
            <form onSubmit={handleBarcodeSubmit} className="relative flex items-center">
              <Barcode className="absolute left-4 w-6 h-6 text-slate-400 dark:text-slate-500" />
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                placeholder="Bipe o código de barras ou digite o código... (Ex: 3*789... para multiplicar)"
                className="w-full pl-12 pr-28 py-3.5 rounded-xl bg-white dark:bg-slate-950 border-2 border-emerald-500/50 focus:border-emerald-500 focus:outline-none text-slate-900 dark:text-white font-mono text-base font-bold shadow-inner placeholder:text-slate-400 dark:placeholder:text-slate-600"
              />
              <button
                type="submit"
                className="absolute right-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all"
              >
                Enter
              </button>
            </form>
          </div>

          {/* TABELA DE ITENS BIPADOS */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <ShoppingCart className="w-16 h-16 stroke-1 text-slate-300 dark:text-slate-700 mb-3 animate-pulse" />
                <p className="text-base font-bold text-slate-600 dark:text-slate-400">O carrinho está vazio</p>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Bipe os produtos com o leitor de código de barras ou pressione <strong className="text-emerald-600">F2</strong> para buscar por nome.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/90 backdrop-blur-sm text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 z-10">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-12 whitespace-nowrap">#</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Código / EAN</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Descrição do Produto</th>
                    <th className="py-2.5 px-3 text-center whitespace-nowrap w-28">Qtd</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Preço Unit.</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Subtotal</th>
                    <th className="py-2.5 px-3 text-center w-12 whitespace-nowrap">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cart.map((item, idx) => (
                    <tr 
                      key={`${item.code}-${idx}`} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group font-medium"
                    >
                      <td className="py-2.5 px-3 text-center text-xs text-slate-400 font-bold whitespace-nowrap">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {item.barcode || item.code}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {item.name}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleUpdateQuantity(idx, -1)}
                            className="w-6 h-6 rounded flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center font-bold text-slate-900 dark:text-white">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateQuantity(idx, 1)}
                            className="w-6 h-6 rounded flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        R$ {item.unit_price.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        R$ {item.total_price.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleRemoveItem(idx)}
                          title="Remover Item"
                          className="text-slate-400 hover:text-red-600 transition-colors p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* RODAPÉ DO CARRINHO */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Volumes no cupom: <strong className="text-slate-900 dark:text-white">{totalQuantity}</strong> itens ({cart.length} produtos diferentes)</span>
            {cart.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Tem certeza que deseja cancelar e esvaziar o cupom atual?')) {
                    setCart([]);
                    focusBarcodeInput();
                  }
                }}
                className="text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar Cupom
              </button>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: TOTAIS E PAGAMENTO (4 COLUNAS) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 flex flex-col justify-between flex-1">
            <div className="space-y-4">
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                Resumo da Venda
              </h2>

              <div className="space-y-2">
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>Subtotal Bruto:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">R$ {subtotal.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>Desconto (R$):</span>
                  <input
                    type="number"
                    min="0"
                    step="0.50"
                    value={discount || ''}
                    onChange={e => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="0,00"
                    className="w-24 text-right font-mono font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>
              </div>

              {/* CARD GIGANTE DO VALOR FINAL */}
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl p-4 text-center">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400 mb-1">
                  Total a Pagar
                </p>
                <div className="text-3xl sm:text-4xl font-black font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
                  R$ {totalFinal.toFixed(2)}
                </div>
              </div>
            </div>

            {/* BOTÃO FINALIZAR GIGANTE */}
            <div className="pt-6">
              <button
                onClick={() => {
                  if (cart.length > 0) setIsPaymentOpen(true);
                  else addToast('Adicione produtos para finalizar.', 'warning');
                }}
                disabled={cart.length === 0}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-black text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3 tracking-wide"
              >
                <CheckCircle2 className="w-6 h-6" />
                FINALIZAR VENDA (F10)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. MODAL: PESQUISA DE PRODUTO POR NOME [F2] */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5 text-emerald-600" />
                <h3 className="font-black text-base text-slate-900 dark:text-white">Buscar Produto no Catálogo (F2)</h3>
              </div>
              <button 
                onClick={() => {
                  setIsSearchOpen(false);
                  focusBarcodeInput();
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex gap-2">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchByName()}
                  placeholder="Digite o nome, princípio ativo ou apresentação..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-emerald-500 font-bold text-sm"
                />
                <button
                  onClick={handleSearchByName}
                  disabled={isSearchingProducts}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2"
                >
                  {isSearchingProducts ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Buscar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {searchResults.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  {searchQuery ? 'Nenhum produto encontrado.' : 'Digite o termo desejado e pressione Enter.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {searchResults.map(prod => (
                    <div 
                      key={prod.code}
                      className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl flex items-center justify-between gap-4 transition-all"
                    >
                      <div>
                        <p className="font-bold text-sm text-slate-900 dark:text-white">{prod.name}</p>
                        <p className="font-mono text-xs text-slate-400">
                          EAN: {prod.barcode || 'S/N'} • Estoque: <strong className={prod.stock_qty > 0 ? 'text-emerald-600' : 'text-red-500'}>{prod.stock_qty} un</strong>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base">
                            R$ {(prod.promo_price > 0 ? prod.promo_price : prod.sale_price).toFixed(2)}
                          </p>
                          {prod.promo_price > 0 && (
                            <p className="text-[10px] text-amber-600 font-bold uppercase">Em Promoção</p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            addItemToCart(prod, 1);
                            setIsSearchOpen(false);
                            focusBarcodeInput();
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL: PAGAMENTO & FINALIZAÇÃO [F10] */}
      {isPaymentOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Forma de Pagamento
              </h3>
              <button 
                onClick={() => {
                  setIsPaymentOpen(false);
                  focusBarcodeInput();
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* SELEÇÃO DE MODALIDADE */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { id: 'DINHEIRO', label: 'Dinheiro', icon: Banknote },
                { id: 'PIX', label: 'PIX', icon: QrCode },
                { id: 'CARTAO_DEBITO', label: 'Débito', icon: CreditCard },
                { id: 'CARTAO_CREDITO', label: 'Crédito', icon: CreditCard },
                { id: 'CREDIARIO', label: 'Crediário', icon: BookOpen }
              ].map(opt => {
                const Icon = opt.icon;
                const isSelected = selectedMethod === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedMethod(opt.id as any)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-black transition-all ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 mb-1" />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* CAMPOS ESPECÍFICOS POR FORMA DE PAGAMENTO */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 mb-5 space-y-3">
              {selectedMethod === 'DINHEIRO' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Valor Recebido em Dinheiro (R$):
                  </label>
                  <input
                    type="text"
                    value={cashReceived}
                    onChange={e => setCashReceived(e.target.value)}
                    placeholder={`Ex: ${totalFinal.toFixed(2)}`}
                    autoFocus
                    className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold text-lg text-slate-900 dark:text-white"
                  />
                  {cashChange > 0 && (
                    <div className="mt-3 p-3 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Troco a Devolver:</span>
                      <span className="text-xl font-black font-mono text-emerald-700 dark:text-emerald-400">
                        R$ {cashChange.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {['CARTAO_DEBITO', 'CARTAO_CREDITO'].includes(selectedMethod) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Bandeira:
                    </label>
                    <select
                      value={cardBrand}
                      onChange={e => setCardBrand(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-xs"
                    >
                      <option value="MASTERCARD">Mastercard</option>
                      <option value="VISA">Visa</option>
                      <option value="ELO">Elo</option>
                      <option value="HIPERCARD">Hipercard</option>
                    </select>
                  </div>

                  {selectedMethod === 'CARTAO_CREDITO' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Parcelas:
                      </label>
                      <select
                        value={installments}
                        onChange={e => setInstallments(parseInt(e.target.value, 10))}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-xs"
                      >
                        <option value="1">1x à vista (R$ {totalFinal.toFixed(2)})</option>
                        <option value="2">2x (R$ {(totalFinal / 2).toFixed(2)})</option>
                        <option value="3">3x (R$ {(totalFinal / 3).toFixed(2)})</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {selectedMethod === 'CREDIARIO' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Vincular Cliente do Crediário:
                  </label>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    placeholder="Filtrar por nome do cliente..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold mb-2"
                  />
                  <div className="max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                    {customersList
                      .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                      .slice(0, 10)
                      .map(c => (
                        <div
                          key={c.id}
                          onClick={() => setSelectedCustomer(c)}
                          className={`p-2 text-xs cursor-pointer font-bold flex justify-between ${
                            selectedCustomer?.id === c.id ? 'bg-emerald-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <span>{c.name}</span>
                          <span className="opacity-75">{c.phone}</span>
                        </div>
                      ))}
                  </div>
                  {selectedCustomer && (
                    <p className="text-xs font-bold text-emerald-600 mt-2">
                      Cliente Selecionado: {selectedCustomer.name}
                    </p>
                  )}
                </div>
              )}

              {selectedMethod === 'PIX' && (
                <div className="text-center py-2 text-xs text-slate-500 font-medium">
                  Solicite a confirmação da notificação do PIX na tela ou consulte no extrato bancário.
                </div>
              )}
            </div>

            {/* BOTÃO CONFIRMAR FINALIZAÇÃO */}
            <button
              onClick={handleConfirmCheckout}
              disabled={isProcessing}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-base rounded-2xl shadow-lg flex items-center justify-center gap-2"
            >
              {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              CONFIRMAR E EMITIR CUPOM (R$ {totalFinal.toFixed(2)})
            </button>
          </div>
        </div>
      )}

      {/* 5. MODAL: CUPOM DE VENDA FINALIZADA & IMPRESSÃO */}
      {completedSale && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-4 mb-4">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/60 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-2">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-black text-lg text-slate-900 dark:text-white">VENDA FINALIZADA COM SUCESSO!</h3>
              <p className="font-mono text-xs text-slate-500 mt-0.5">Cupom: {completedSale.sale_id}</p>
              <p className="text-[11px] text-slate-400">{completedSale.date} às {completedSale.time}</p>
            </div>

            {/* ITENS DO CUPOM */}
            <div className="border-b border-dashed border-slate-300 dark:border-slate-700 pb-3 mb-3 max-h-48 overflow-y-auto space-y-1.5 font-mono text-xs">
              {completedSale.items.map((it: any, i: number) => (
                <div key={i} className="flex justify-between">
                  <span className="truncate pr-2">{it.quantity}x {it.name}</span>
                  <span className="font-bold">R$ {it.total_price.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* TOTAIS DO CUPOM */}
            <div className="space-y-1 font-mono text-xs mb-4">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Subtotal:</span>
                <span>R$ {completedSale.total_items_value.toFixed(2)}</span>
              </div>
              {completedSale.discount_value > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>Desconto:</span>
                  <span>- R$ {completedSale.discount_value.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-base text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                <span>TOTAL:</span>
                <span className="text-emerald-600 dark:text-emerald-400">R$ {completedSale.total_final.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500 pt-1">
                <span>Forma de Pagto:</span>
                <span className="font-bold">{completedSale.payment.method}</span>
              </div>
              {completedSale.change > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Troco Devolvido:</span>
                  <span>R$ {completedSale.change.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* BOTÕES DE AÇÃO */}
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Imprimir Cupom
              </button>
              <button
                onClick={() => {
                  setCompletedSale(null);
                  focusBarcodeInput();
                }}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs"
              >
                Nova Venda (ESC)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
