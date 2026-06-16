import React, { useState, useEffect } from 'react';
import {
  Search, CheckCircle, X, Phone,
  ShoppingBag, Pill, Image as ImageIcon, Loader2, Sparkles,
  User, Copy, Plus, ClipboardCopy
} from 'lucide-react';
import { useToast } from './ToastContext';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  barcode: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  category: string | null;
  brand: string | null;
}

interface CartItem {
  product: Product;
  status: 'comprado' | 'pesquisado';
}

interface Customer {
  id?: string;
  name: string;
  nickname: string;
  cpf: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export function WhatsAppVendas({ onClose }: { onClose?: () => void }) {
  const { addToast } = useToast();

  // Abas
  const [activeTab, setActiveTab] = useState<'estoque' | 'cliente'>('estoque');

  // Estados de Busca de Produtos
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [copyingProductId, setCopyingProductId] = useState<number | null>(null);
  const [hideOutOfStock, setHideOutOfStock] = useState(true);
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});
  
  // Carrinho / Lista de Envio
  const [selectedProducts, setSelectedProducts] = useState<CartItem[]>([]);
  const [crmStatus, setCrmStatus] = useState<'pesquisado' | 'comprado'>('pesquisado');

  // Ficha do Cliente
  const [clientInfo, setClientInfo] = useState<Customer | null>(null);
  const [clientHistory, setClientHistory] = useState<Array<{
    productName: string;
    status: string;
    date: string;
  }>>([]);
  const [loadingClient, setLoadingClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);

  // Busca de Clientes no CRM
  const [crmSearchQuery, setCrmSearchQuery] = useState('');
  const [crmSearchResults, setCrmSearchResults] = useState<any[]>([]);
  const [isSearchingCrm, setIsSearchingCrm] = useState(false);

  // Categorias de Produtos
  const [selectedCategory, setSelectedCategory] = useState('Todos');

  // Helper para classificar categoria de produto de forma dinâmica
  const getProductCategory = (prod: Product): string => {
    if (prod.category) {
      const catLower = prod.category.toLowerCase();
      if (catLower.includes('desodorante') || catLower.includes('antiperspirante')) return 'Desodorantes';
      if (catLower.includes('hidratante') || catLower.includes('creme') || catLower.includes('loção')) return 'Hidratantes';
      if (catLower.includes('pastilha') || catLower.includes('garganta')) return 'Pastilhas';
      if (catLower.includes('medicamento') || catLower.includes('comprimido') || catLower.includes('droga')) return 'Medicamentos';
      return prod.category;
    }
    
    const nameLower = prod.name.toLowerCase();
    if (nameLower.includes('desodorante') || nameLower.includes('spray corporal') || nameLower.includes('rexona') || nameLower.includes('dove') || nameLower.includes('roll-on')) return 'Desodorantes';
    if (nameLower.includes('hidratante') || nameLower.includes('creme corporal') || nameLower.includes('loção') || nameLower.includes('cerave') || nameLower.includes('nivea')) return 'Hidratantes';
    if (nameLower.includes('pastilha') || nameLower.includes('strepsils') || nameLower.includes('valda') || nameLower.includes('garganta') || nameLower.includes('past.garg')) return 'Pastilhas';
    if (nameLower.includes('shampoo') || nameLower.includes('condicionador') || nameLower.includes('cabelo')) return 'Cabelos';
    if (nameLower.includes('neopiridin') || nameLower.includes('furosemida') || nameLower.includes('dorflex') || nameLower.includes('paracetamol')) return 'Medicamentos';
    
    return 'Outros';
  };

  const categoriesList = React.useMemo(() => {
    const list = new Set<string>();
    products.forEach(p => {
      list.add(getProductCategory(p));
    });
    return ['Todos', ...Array.from(list)];
  }, [products]);

  const filteredProducts = React.useMemo(() => {
    if (selectedCategory === 'Todos') return products;
    return products.filter(p => getProductCategory(p) === selectedCategory);
  }, [products, selectedCategory]);

  useEffect(() => {
    if (!categoriesList.includes(selectedCategory)) {
      setSelectedCategory('Todos');
    }
  }, [categoriesList]);

  // Executa busca de produtos com debounce
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      searchProducts(productQuery);
    }, 400);
    return () => clearTimeout(delayDebounce);
  }, [productQuery]);

  // Se mudar o filtro sem estoque, executa imediatamente
  useEffect(() => {
    if (productQuery.length >= 2) {
      searchProducts(productQuery);
    }
  }, [hideOutOfStock]);

  // 1. Pesquisa produtos no Digifarma
  const searchProducts = async (queryStr: string) => {
    if (queryStr.length < 2) {
      setProducts([]);
      return;
    }
    setSearchingProducts(true);
    try {
      const res = await fetch(`/api/whatsapp-vendas/search-products?q=${encodeURIComponent(queryStr)}&hideOutOfStock=${hideOutOfStock}`);
      const data = await res.json();
      if (data.success) {
        const sortedProducts = (data.products || []).sort((a: Product, b: Product) => {
          const aStock = a.stock > 0 ? 1 : 0;
          const bStock = b.stock > 0 ? 1 : 0;
          return bStock - aStock;
        });
        setProducts(sortedProducts);
      }
    } catch (err) {
      addToast('Erro ao pesquisar produtos no estoque.', 'error');
    } finally {
      setSearchingProducts(false);
    }
  };

  // Carrinho / Lista de Envio
  const toggleProductSelection = (product: Product) => {
    setSelectedProducts(prev => {
      const exists = prev.some(item => item.product.id === product.id);
      if (exists) {
        return prev.filter(item => item.product.id !== product.id);
      } else {
        return [...prev, { product, status: crmStatus as 'comprado' | 'pesquisado' }];
      }
    });
  };

  const isProductSelected = (productId: number) => {
    return selectedProducts.some(item => item.product.id === productId);
  };

  const toggleCartItemStatus = (productId: number) => {
    setSelectedProducts(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { 
          ...item, 
          status: item.status === 'comprado' ? 'pesquisado' : 'comprado' 
        };
      }
      return item;
    }));
  };

  // Copiar Texto do Produto
  const copyProductText = (prod: Product) => {
    const priceFormatted = parseFloat(prod.price as any).toFixed(2).replace('.', ',');
    const textMsg = `*${prod.name}*\n💵 Preço: *R$ ${priceFormatted}*`;
    navigator.clipboard.writeText(textMsg)
      .then(() => addToast('📝 Descrição e preço copiados!', 'success'))
      .catch(() => addToast('Erro ao copiar texto.', 'error'));
  };

  // Copiar Imagem do Produto (com Canvas Fallback)
  const convertToPngBlob = (url: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context not available'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob failed'));
          }
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('Failed to load image for canvas conversion'));
      img.src = url;
    });
  };

  const copyProductImage = async (prod: Product) => {
    if (!prod.imageUrl) {
      addToast('Este produto não possui imagem cadastrada.', 'warning');
      return;
    }
    setCopyingProductId(prod.id);
    try {
      const proxyUrl = `/api/whatsapp-vendas/proxy-image?url=${encodeURIComponent(prod.imageUrl)}`;
      const response = await fetch(proxyUrl);
      const blob = await response.blob();
      
      let pngBlob = blob;
      if (blob.type !== 'image/png') {
        pngBlob = await convertToPngBlob(proxyUrl);
      }
      
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlob
        })
      ]);
      addToast('📷 Imagem do produto copiada para a área de transferência!', 'success');
    } catch (err) {
      console.error('Erro ao copiar imagem:', err);
      try {
        const proxyUrl = `/api/whatsapp-vendas/proxy-image?url=${encodeURIComponent(prod.imageUrl)}`;
        const pngBlob = await convertToPngBlob(proxyUrl);
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': pngBlob
          })
        ]);
        addToast('📷 Imagem do produto copiada!', 'success');
      } catch (canvasErr) {
        console.error('Erro no fallback do canvas:', canvasErr);
        addToast('Erro ao copiar imagem. Verifique o suporte do navegador.', 'error');
      }
    } finally {
      setCopyingProductId(null);
    }
  };

  const getProductImageSrc = (imageUrl: string | null) => {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return `/api/whatsapp-vendas/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    }
    return imageUrl;
  };

  // Copiar Orçamento Consolidadado (Texto)
  const copyBudget = () => {
    if (selectedProducts.length === 0) return;
    let textMsg = `*Orçamento - BelaFarma*\n\n`;
    selectedProducts.forEach((item) => {
      const priceFormatted = parseFloat(item.product.price as any).toFixed(2).replace('.', ',');
      textMsg += `• *${item.product.name}*\n💵 Preço: *R$ ${priceFormatted}* (${item.status === 'comprado' ? 'Levar' : 'Orçado'})\n\n`;
    });
    const total = selectedProducts.reduce((sum, item) => sum + item.product.price, 0);
    const totalFormatted = total.toFixed(2).replace('.', ',');
    textMsg += `-------------------------\n💰 *Total: R$ ${totalFormatted}*`;

    navigator.clipboard.writeText(textMsg)
      .then(() => {
        addToast('📋 Orçamento consolidado copiado!', 'success');
        setSelectedProducts([]);
      })
      .catch(() => addToast('Erro ao copiar orçamento.', 'error'));
  };

  // ─── LÓGICA DE CLIENTES ──────────────────────────────────────────────────────

  // Carrega Ficha do Cliente do SQLite
  const loadCustomerData = async (phoneStr: string) => {
    setLoadingClient(true);
    try {
      const res = await fetch(`/api/whatsapp-vendas/customers/${encodeURIComponent(phoneStr)}`);
      const data = await res.json();
      if (data.success) {
        setClientInfo(data.customer || {
          name: '',
          nickname: '',
          cpf: '',
          phone: phoneStr,
          email: '',
          address: '',
          notes: ''
        });
        setClientHistory(data.history || []);
      } else {
        addToast('Erro ao carregar dados do cliente.', 'error');
      }
    } catch (err) {
      addToast('Erro de rede ao buscar dados do cliente.', 'error');
    } finally {
      setLoadingClient(false);
    }
  };

  // Busca clientes no CRM (SQLite)
  const handleSearchCrm = async (query: string) => {
    setCrmSearchQuery(query);
    if (query.trim().length < 2) {
      setCrmSearchResults([]);
      return;
    }
    setIsSearchingCrm(true);
    try {
      const res = await fetch(`/api/whatsapp-vendas/search-customers?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) {
        setCrmSearchResults(data.customers || []);
      }
    } catch (err) {
      console.error('Erro ao buscar clientes no CRM:', err);
    } finally {
      setIsSearchingCrm(false);
    }
  };

  // Seleciona um cliente e preenche a ficha
  const handleSelectCrmCustomer = (customer: any) => {
    setClientInfo({
      id: customer.id,
      name: customer.name || '',
      nickname: customer.nickname || '',
      cpf: customer.cpf || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      notes: customer.notes || ''
    });
    if (customer.phone) {
      loadCustomerHistory(customer.phone);
    }
    setCrmSearchQuery('');
    setCrmSearchResults([]);
    addToast(`👤 Cliente selecionado: ${customer.name}`, 'info');
  };

  // Carrega histórico do cliente
  const loadCustomerHistory = async (phone: string) => {
    try {
      const res = await fetch(`/api/whatsapp-vendas/customers/${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.success) {
        setClientHistory(data.history || []);
      }
    } catch (e) {
      console.warn('Erro ao carregar histórico:', e);
    }
  };

  // Salva ou atualiza Ficha do Cliente
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientInfo || savingClient) return;

    if (!clientInfo.phone) {
      addToast('O campo WhatsApp (Telefone) é obrigatório.', 'warning');
      return;
    }

    setSavingClient(true);
    try {
      const res = await fetch(`/api/whatsapp-vendas/customers/${encodeURIComponent(clientInfo.phone)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientInfo)
      });
      const data = await res.json();
      if (data.success) {
        addToast('✅ Cadastro do cliente salvo com sucesso!', 'success');
        loadCustomerData(clientInfo.phone);
      } else {
        addToast(data.error || 'Erro ao salvar cadastro.', 'error');
      }
    } catch (err) {
      addToast('Erro de rede ao salvar dados do cliente.', 'error');
    } finally {
      setSavingClient(false);
    }
  };

  const handleNewCustomer = () => {
    setClientInfo({
      name: '',
      nickname: '',
      cpf: '',
      phone: '',
      email: '',
      address: '',
      notes: ''
    });
    setClientHistory([]);
    addToast('📝 Preencha os dados do novo cliente.', 'info');
  };

  const copyText = (text: string, message: string) => {
    if (!text) {
      addToast('Campo vazio, nada para copiar.', 'warning');
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => addToast(message, 'success'))
      .catch(() => addToast('Erro ao copiar.', 'error'));
  };

  const copyFullClientInfo = () => {
    if (!clientInfo) return;
    const text = `*Ficha de Cliente - BelaFarma*
👤 *Nome:* ${clientInfo.name}
${clientInfo.nickname ? `🏷️ *Apelido:* ${clientInfo.nickname}\n` : ''}${clientInfo.cpf ? `🪪 *CPF:* ${clientInfo.cpf}\n` : ''}📞 *WhatsApp:* ${clientInfo.phone}
${clientInfo.email ? `📧 *E-mail:* ${clientInfo.email}\n` : ''}📍 *Endereço de Entrega:* ${clientInfo.address || 'Não cadastrado'}
${clientInfo.notes ? `📝 *Observações:* ${clientInfo.notes}` : ''}`;
    copyText(text, '📋 Ficha completa copiada!');
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-950 p-6 animate-in fade-in duration-300 overflow-hidden">
      {/* Header do Módulo */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-650 flex items-center justify-center font-extrabold text-white text-lg shadow-md">
            BF
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white leading-tight">WhatsApp Vendas</h1>
            <p className="text-xs text-slate-500 font-medium">Ferramenta de Consulta e Cópia Manual</p>
          </div>
        </div>

        {/* Abas de Navegação */}
        <div className="flex bg-slate-200/80 dark:bg-slate-900 p-1 rounded-xl text-sm font-bold shadow-inner">
          <button
            onClick={() => setActiveTab('estoque')}
            className={`px-5 py-2.5 rounded-lg transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'estoque'
                ? 'bg-white dark:bg-red-700 text-red-700 dark:text-white shadow-md'
                : 'text-slate-600 dark:text-slate-350 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Consulta de Estoque
          </button>
          <button
            onClick={() => setActiveTab('cliente')}
            className={`px-5 py-2.5 rounded-lg transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'cliente'
                ? 'bg-white dark:bg-red-700 text-red-700 dark:text-white shadow-md'
                : 'text-slate-600 dark:text-slate-350 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <User className="w-4 h-4" />
            Ficha do Cliente
          </button>
        </div>
      </div>

      {/* Conteúdo das Abas */}
      <div className="flex-1 overflow-hidden mt-6 flex flex-col">
        {activeTab === 'estoque' ? (
          <div className="flex-1 flex gap-6 overflow-hidden">
            {/* Coluna Principal da Busca de Produtos */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              {/* Campo de Busca */}
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Pesquisar produto no Digifarma (digite no mínimo 2 caracteres)..."
                    value={productQuery}
                    onChange={e => setProductQuery(e.target.value)}
                    className="w-full pl-12 pr-6 py-3.5 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-650 focus:bg-white dark:focus:bg-slate-850 transition-all shadow-inner"
                  />
                </div>
                
                {/* Toggle para ocultar sem estoque */}
                <div className="flex items-center gap-2.5 flex-shrink-0 self-start md:self-center">
                  <button
                    type="button"
                    onClick={() => setHideOutOfStock(prev => !prev)}
                    className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 shadow-sm ${
                      hideOutOfStock
                        ? 'bg-red-50 border-red-200 text-red-750 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-750'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${hideOutOfStock ? 'bg-red-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-650'}`} />
                    Ocultar Sem Estoque
                  </button>
                </div>
              </div>

              {/* Categorias */}
              {products.length > 0 && (
                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
                  {categoriesList.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-full font-bold text-xs whitespace-nowrap transition-all duration-150 ${
                        selectedCategory === cat
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              {/* Grid / Lista de Produtos */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {searchingProducts ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-red-600" />
                    <span className="text-sm">Buscando no Digifarma...</span>
                  </div>
                ) : productQuery.length < 2 ? (
                  <div className="text-center py-20 text-slate-400 text-sm flex flex-col items-center gap-3">
                    <Sparkles className="w-10 h-10 text-amber-500 animate-pulse" />
                    <span>Digite o nome do produto ou código de barras para começar a pesquisar.</span>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm italic">
                    Nenhum produto encontrado nesta categoria.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredProducts.map(prod => {
                      const isStockOk = prod.stock > 5;
                      const hasStock = prod.stock > 0;
                      const isCopying = copyingProductId === prod.id;

                      return (
                        <div
                          key={prod.id}
                          className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition duration-200 flex flex-col overflow-hidden relative group"
                        >
                          {/* Botão de Seleção (carrinho) */}
                          <button
                            onClick={() => toggleProductSelection(prod)}
                            className={`absolute top-3 right-3 p-1.5 rounded-full transition-all duration-200 z-10 ${
                              isProductSelected(prod.id)
                                ? 'bg-red-600 text-white shadow-sm'
                                : 'bg-white/80 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-red-600 shadow-sm'
                            }`}
                            title={isProductSelected(prod.id) ? "Remover da lista de orçamento" : "Adicionar à lista de orçamento"}
                          >
                            <CheckCircle className={`w-5 h-5 ${isProductSelected(prod.id) ? 'fill-current text-white' : ''}`} />
                          </button>

                          <div className="p-4 flex gap-4">
                            {/* Imagem do Produto */}
                            <div className="w-32 h-32 bg-white dark:bg-slate-800 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-100 dark:border-slate-700">
                              {prod.imageUrl && !imageErrors[prod.id] ? (
                                <img 
                                  src={getProductImageSrc(prod.imageUrl)} 
                                  alt={prod.name}
                                  className="w-full h-full object-contain group-hover:scale-105 transition duration-300"
                                  onError={() => {
                                    setImageErrors(prev => ({ ...prev, [prod.id]: true }));
                                  }}
                                />
                              ) : (
                                <Pill className="w-14 h-14 text-slate-300 dark:text-slate-600" />
                              )}
                            </div>

                            {/* Detalhes do Produto */}
                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                              <div>
                                <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate pr-6" title={prod.name}>
                                  {prod.name}
                                </h4>
                                {prod.barcode && (
                                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">EAN: {prod.barcode}</p>
                                )}
                              </div>
                              
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-base font-extrabold text-red-600 dark:text-red-400">
                                  R$ {prod.price.toFixed(2).replace('.', ',')}
                                </span>
                                
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                                  isStockOk 
                                    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                                    : hasStock
                                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-405'
                                      : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                                }`}>
                                  {hasStock ? `${prod.stock} un` : 'Falta'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Ações de Cópia */}
                          <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                            <button
                              onClick={() => copyProductText(prod)}
                              className="flex-1 py-2 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-lg font-bold text-xs transition flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 shadow-sm"
                            >
                              <Copy className="w-3.5 h-3.5 text-red-500" />
                              Copiar Texto
                            </button>
                            {prod.imageUrl && (
                              <button
                                onClick={() => copyProductImage(prod)}
                                disabled={isCopying}
                                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-xs disabled:opacity-50 transition flex items-center justify-center gap-1.5 shadow-sm"
                              >
                                {isCopying ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ImageIcon className="w-3.5 h-3.5" />
                                )}
                                Copiar Foto
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Painel do Orçamento (Carrinho) no Lado Direito */}
            {selectedProducts.length > 0 && (
              <div className="w-[340px] flex-shrink-0 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-in slide-in-from-right duration-300">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-red-650" />
                    Lista de Orçamento ({selectedProducts.length})
                  </span>
                  <button 
                    onClick={() => setSelectedProducts([])}
                    className="text-xs text-red-600 hover:text-red-800 font-bold transition"
                  >
                    Limpar
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {selectedProducts.map(item => (
                    <div key={item.product.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="truncate font-bold text-slate-850 dark:text-slate-100 block" title={item.product.name}>
                          {item.product.name}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          R$ {item.product.price.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleCartItemStatus(item.product.id)}
                          className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase transition border ${
                            item.status === 'comprado'
                              ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-green-250/20'
                              : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-450 border-blue-250/20'
                          }`}
                        >
                          {item.status === 'comprado' ? 'Levar' : 'Orçado'}
                        </button>
                        <button 
                          onClick={() => toggleProductSelection(item.product)}
                          className="text-slate-400 hover:text-red-500 transition p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Resumo e Ação */}
                <div className="p-4 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-medium">Total Estimado:</span>
                    <span className="text-base font-extrabold text-red-650 dark:text-red-400">
                      R$ {selectedProducts.reduce((sum, item) => sum + item.product.price, 0).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <button
                    onClick={copyBudget}
                    className="w-full py-3 bg-red-650 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <ClipboardCopy className="w-4 h-4" />
                    Copiar Orçamento (Texto)
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Aba Clientes (CRM) */
          <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            {/* Barra de Busca de Clientes */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-4 items-center flex-shrink-0 bg-slate-50/50 dark:bg-slate-900/30">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar cliente no CRM por nome, apelido, telefone ou CPF..."
                  value={crmSearchQuery}
                  onChange={e => handleSearchCrm(e.target.value)}
                  className="w-full pl-12 pr-6 py-3.5 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-650 transition-all shadow-sm"
                />
                
                {/* Resultados da Busca */}
                {crmSearchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-150 dark:divide-slate-800">
                    {crmSearchResults.map(cust => (
                      <button
                        key={cust.id}
                        type="button"
                        onClick={() => handleSelectCrmCustomer(cust)}
                        className="w-full px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 flex flex-col gap-1 transition duration-150"
                      >
                        <span className="font-bold text-slate-800 dark:text-white text-sm">{cust.name}</span>
                        <span className="text-xs text-slate-500">
                          📞 WhatsApp: {cust.phone || 'Não informado'} {cust.cpf ? ` | 🪪 CPF: ${cust.cpf}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 w-full md:w-auto">
                <button
                  type="button"
                  onClick={handleNewCustomer}
                  className="w-full md:w-auto px-5 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Novo Cadastro
                </button>
              </div>
            </div>

            {/* Ficha Cadastral / Detalhes */}
            <div className="flex-1 overflow-y-auto">
              {loadingClient ? (
                <div className="flex flex-col items-center justify-center h-60 gap-2 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-red-650" />
                  <span className="text-sm">Buscando cadastro do cliente...</span>
                </div>
              ) : clientInfo ? (
                <div className="p-6 max-w-4xl mx-auto">
                  {/* Ficha do Cliente Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-slate-150 dark:border-slate-800 mb-6">
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-150 uppercase tracking-wider">
                      Ficha Cadastral do Cliente
                    </h3>
                    <button
                      type="button"
                      onClick={copyFullClientInfo}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-lg font-bold text-xs transition flex items-center gap-2 border border-slate-200 dark:border-slate-750 shadow-sm"
                    >
                      <ClipboardCopy className="w-4 h-4 text-red-500" />
                      Copiar Ficha Completa
                    </button>
                  </div>

                  <form onSubmit={handleSaveCustomer} className="space-y-6">
                    {/* Linha 1: Nome Completo */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Nome Completo
                      </label>
                      <input
                        type="text"
                        required
                        value={clientInfo.name}
                        onChange={e => setClientInfo(prev => prev ? { ...prev, name: e.target.value } : null)}
                        placeholder="Nome completo do cliente"
                        className="w-full px-4 py-3 rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-650 shadow-sm"
                      />
                    </div>

                    {/* Linha 2: Apelido / CPF */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Como Chamar / Apelido
                        </label>
                        <input
                          type="text"
                          value={clientInfo.nickname || ''}
                          onChange={e => setClientInfo(prev => prev ? { ...prev, nickname: e.target.value } : null)}
                          placeholder="Ex: Sr. João, Maria, etc."
                          className="w-full px-4 py-3 rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-650 shadow-sm"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex justify-between items-center">
                          <span>CPF</span>
                          {clientInfo.cpf && (
                            <button
                              type="button"
                              onClick={() => copyText(clientInfo.cpf, '🪪 CPF copiado!')}
                              className="text-[10px] text-red-600 hover:underline font-extrabold lowercase flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" /> copiar
                            </button>
                          )}
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: 000.000.000-00"
                          value={clientInfo.cpf || ''}
                          onChange={e => setClientInfo(prev => prev ? { ...prev, cpf: e.target.value } : null)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-650 shadow-sm"
                        />
                      </div>
                    </div>

                    {/* Linha 3: WhatsApp / E-mail */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex justify-between items-center">
                          <span>WhatsApp (Telefone)</span>
                          {clientInfo.phone && (
                            <button
                              type="button"
                              onClick={() => copyText(clientInfo.phone, '📞 Telefone copiado!')}
                              className="text-[10px] text-red-600 hover:underline font-extrabold lowercase flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" /> copiar
                            </button>
                          )}
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Somente números (com DDD)"
                          value={clientInfo.phone}
                          onChange={e => setClientInfo(prev => prev ? { ...prev, phone: e.target.value.replace(/\D/g, '') } : null)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-650 shadow-sm"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          E-mail
                        </label>
                        <input
                          type="email"
                          placeholder="email@exemplo.com"
                          value={clientInfo.email || ''}
                          onChange={e => setClientInfo(prev => prev ? { ...prev, email: e.target.value } : null)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-650 shadow-sm"
                        />
                      </div>
                    </div>

                    {/* Linha 4: Endereço de Entrega */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex justify-between items-center">
                        <span>Endereço de Entrega</span>
                        {clientInfo.address && (
                          <button
                            type="button"
                            onClick={() => copyText(clientInfo.address, '📍 Endereço de entrega copiado!')}
                            className="text-[10px] text-red-600 hover:underline font-extrabold lowercase flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> copiar
                          </button>
                        )}
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Rua, número, bairro, complemento, cidade e pontos de referência..."
                        value={clientInfo.address || ''}
                        onChange={e => setClientInfo(prev => prev ? { ...prev, address: e.target.value } : null)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-650 shadow-sm resize-none"
                      />
                    </div>

                    {/* Linha 5: Observações / Alergias */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Observações Importantes / Notas
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Preferências de horário, remédios contínuos, alergias (ex: alérgico a dipirona), etc."
                        value={clientInfo.notes || ''}
                        onChange={e => setClientInfo(prev => prev ? { ...prev, notes: e.target.value } : null)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-650 shadow-sm resize-none"
                      />
                    </div>

                    {/* Botão de Salvar */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={savingClient}
                        className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm uppercase tracking-wider shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 flex items-center justify-center gap-2"
                      >
                        {savingClient ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" /> Salvando no CRM...
                          </>
                        ) : (
                          'Salvar Cadastro no CRM'
                        )}
                      </button>
                    </div>
                  </form>

                  {/* Histórico de Compras e Interações do CRM */}
                  <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800">
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4">
                      Vendas e Consultas (CRM)
                    </h3>
                    
                    {clientHistory.length === 0 ? (
                      <p className="text-sm text-slate-400 italic text-center py-6 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-dashed border-slate-250 dark:border-slate-800">
                        Nenhum registro de interação ou compra encontrado para este cliente.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {clientHistory.map((h, i) => {
                          const isPurchase = h.status === 'comprado';
                          return (
                            <div
                              key={i}
                              className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center text-sm"
                            >
                              <div className="min-w-0 pr-4">
                                <span className="font-bold text-slate-800 dark:text-slate-200 truncate block" title={h.productName}>
                                  {h.productName}
                                </span>
                                <span className="text-[11px] text-slate-400 mt-1 block font-mono">
                                  {new Date(h.date).toLocaleString('pt-BR')}
                                </span>
                              </div>
                              <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase whitespace-nowrap flex-shrink-0 ${
                                isPurchase 
                                  ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-450 border border-green-200/20'
                                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-450 border border-blue-200/20'
                              }`}>
                                {h.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-24 text-slate-400 text-sm flex flex-col items-center gap-3">
                  <User className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                  <span>Busque um cliente cadastrado no topo ou clique em "Novo Cadastro" para começar.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default WhatsAppVendas;
