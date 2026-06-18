import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Search, 
  Trash2, 
  Plus, 
  MessageSquare, 
  Loader2,
  Package,
  Check,
  Smartphone,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { useToast } from './ToastContext';

interface CriticalProduct {
  id: string;
  produto_id: number;
  productName: string;
  minStock: number;
}

interface CriticalAlert {
  id: string;
  produto_id: number;
  productName: string;
  minStock: number;
  currentStock: number;
  isZero: boolean;
}

export const CriticalStockManager: React.FC = () => {
  const [monitoredProducts, setMonitoredProducts] = useState<CriticalProduct[]>([]);
  const [alerts, setAlerts] = useState<CriticalAlert[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [checkingAlerts, setCheckingAlerts] = useState(true);

  // Search/Add states
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedDigiProduct, setSelectedDigiProduct] = useState<any | null>(null);
  const [minStockValue, setMinStockValue] = useState(0);
  const [isAdding, setIsAdding] = useState(false);

  const [notifyingAdmin, setNotifyingAdmin] = useState(false);
  const { addToast } = useToast();

  const fetchMonitoredAndCheck = async () => {
    setLoadingList(true);
    setCheckingAlerts(true);
    try {
      // Fetch monitored list
      const listRes = await fetch('/api/stock/critical');
      if (listRes.ok) {
        const listData = await listRes.json();
        setMonitoredProducts(listData);
      }

      // Fetch alerts
      const checkRes = await fetch('/api/stock/critical/check');
      if (checkRes.status === 503) {
        addToast('O servidor do Digifarma está Offline.', 'error');
        setAlerts([]);
        return;
      }
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        setAlerts(checkData.alerts || []);
      }
    } catch (err) {
      console.error(err);
      addToast('Erro ao carregar dados de estoque crítico.', 'error');
    } finally {
      setLoadingList(false);
      setCheckingAlerts(false);
    }
  };

  useEffect(() => {
    fetchMonitoredAndCheck();
  }, []);

  // Search products in Digifarma as user types
  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearchingProducts(true);
      try {
        const response = await fetch(`/api/stock/products?search=${encodeURIComponent(searchTerm)}&limit=10&stockStatus=todos`);
        if (response.status === 503) {
          setSearchResults([]);
          return;
        }
        if (response.ok) {
          const data = await response.json();
          // listarProdutosEstoque returns { total, products: [...] }
          setSearchResults(data.products || []);
        }
      } catch (err) {
        console.error('Error searching products:', err);
      } finally {
        setSearchingProducts(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSelectProduct = (product: any) => {
    setSelectedDigiProduct(product);
    setSearchTerm('');
    setSearchResults([]);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDigiProduct) return;

    setIsAdding(true);
    try {
      const response = await fetch('/api/stock/critical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_id: selectedDigiProduct.id,
          productName: selectedDigiProduct.name,
          minStock: minStockValue
        })
      });

      if (response.ok) {
        addToast('Produto adicionado ao monitoramento com sucesso!', 'success');
        setSelectedDigiProduct(null);
        setMinStockValue(0);
        fetchMonitoredAndCheck();
      } else {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao adicionar.');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao salvar produto crítico.', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Deseja parar de monitorar este produto?')) return;

    try {
      const response = await fetch(`/api/stock/critical/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        addToast('Produto removido do monitoramento.', 'success');
        fetchMonitoredAndCheck();
      } else {
        throw new Error('Erro ao deletar');
      }
    } catch (err) {
      addToast('Erro ao remover produto.', 'error');
    }
  };

  const handleNotifyAdmin = async () => {
    if (alerts.length === 0) {
      addToast('Não há alertas pendentes para envio.', 'info');
      return;
    }

    setNotifyingAdmin(true);
    try {
      const response = await fetch('/api/stock/critical/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alerts })
      });

      if (response.ok) {
        addToast('Alerta consolidado enviado ao WhatsApp do administrador!', 'success');
      } else {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao disparar WhatsApp.');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao enviar alerta por WhatsApp.', 'error');
    } finally {
      setNotifyingAdmin(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-500 animate-pulse" />
            Estoque Crítico Monitorado
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold italic text-sm">
            Configure produtos de alta relevância para receber alertas caso o estoque zere ou atinja níveis mínimos no Digifarma.
          </p>
        </div>
        <button
          onClick={fetchMonitoredAndCheck}
          className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-md"
        >
          Atualizar Estoques
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Painel de Cadastro e Alertas */}
        <div className="lg:col-span-1 space-y-8">
          {/* Adicionar Produto */}
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-500" />
              Monitorar Produto
            </h2>

            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="relative">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase ml-2">Buscar Produto no Digifarma</label>
                <div className="relative mt-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Digitar nome do produto..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm outline-none focus:border-amber-500"
                  />
                  {searchingProducts && (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 animate-spin" />
                  )}
                </div>

                {/* Dropdown de Busca */}
                {searchResults.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-2 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 shadow-xl rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                    {searchResults.map(prod => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => handleSelectProduct(prod)}
                        className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex justify-between items-center"
                      >
                        <span className="truncate w-3/4">{prod.name}</span>
                        <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                          Estoque: {prod.stock || 0}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedDigiProduct && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border-2 border-emerald-100 dark:border-emerald-900 rounded-2xl space-y-4 animate-in slide-in-from-top-2 duration-300">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="text-[9px] font-black text-emerald-600 uppercase">Selecionado</p>
                      <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">{selectedDigiProduct.name}</p>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setSelectedDigiProduct(null)} 
                      className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      Remover
                    </button>
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-1">Estoque de Alerta (Menor ou igual a)*</label>
                    <input
                      type="number"
                      min="0"
                      value={minStockValue}
                      onChange={e => setMinStockValue(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full mt-1 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isAdding}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    {isAdding ? 'Salvando...' : 'Adicionar ao Alerta'}
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Resumo de Alertas */}
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2.5rem] p-8 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Alertas Ativos
              </h2>
              <span className="px-3 py-1 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-full text-[10px] font-black">
                {alerts.length} ITENS
              </span>
            </div>

            {checkingAlerts ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 dark:bg-slate-800/20 rounded-2xl text-slate-500 font-bold text-xs">
                ✅ Nenhum produto monitorado está abaixo do limite!
              </div>
            ) : (
              <div className="space-y-4">
                <div className="max-h-60 overflow-y-auto space-y-3">
                  {alerts.map(alt => (
                    <div key={alt.id} className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900 rounded-2xl flex justify-between items-center">
                      <div className="w-2/3">
                        <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase truncate">{alt.productName}</p>
                        <p className="text-[10px] font-bold text-slate-400">ID Digifarma: #{alt.produto_id}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-red-600 dark:text-red-400">Estoque: {alt.currentStock}</p>
                        <p className="text-[9px] font-bold text-slate-400">Mínimo: {alt.minStock}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleNotifyAdmin}
                  disabled={notifyingAdmin}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-850 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <MessageSquare className="w-4 h-4" />
                  {notifyingAdmin ? 'Enviando Alerta...' : 'Enviar Alerta WhatsApp ADM'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Lista Completa Monitorada */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2.5rem] shadow-sm overflow-hidden">
            <div className="p-6 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Produtos sob Monitoramento</h2>
              <span className="text-xs font-black text-slate-400 uppercase">{monitoredProducts.length} Cadastrados</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">ID</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Nome do Produto</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Mínimo Configurado</th>
                    <th className="px-8 py-4 text-center text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Status Alerta</th>
                    <th className="px-8 py-4 text-center text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingList ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500 font-bold">Carregando produtos...</td>
                    </tr>
                  ) : monitoredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500 font-bold">Nenhum produto cadastrado no monitoramento de estoque crítico.</td>
                    </tr>
                  ) : (
                    monitoredProducts.map(item => {
                      const hasAlert = alerts.some(a => a.produto_id === item.produto_id);
                      const alertObj = alerts.find(a => a.produto_id === item.produto_id);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                          <td className="px-8 py-4 font-black text-slate-400">#{item.produto_id}</td>
                          <td className="px-8 py-4 font-black text-slate-800 dark:text-slate-200 uppercase">{item.productName}</td>
                          <td className="px-8 py-4 text-right font-black text-slate-800 dark:text-slate-200">{item.minStock} un</td>
                          <td className="px-8 py-4 text-center">
                            {hasAlert ? (
                              <span className="inline-flex px-3 py-1 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-full text-[10px] font-black uppercase tracking-wider">
                                Baixo (Estoque: {alertObj?.currentStock})
                              </span>
                            ) : (
                              <span className="inline-flex px-3 py-1 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-wider">
                                Normal
                              </span>
                            )}
                          </td>
                          <td className="px-8 py-4 text-center">
                            <button
                              onClick={() => handleDeleteProduct(item.id)}
                              className="p-2 bg-red-50 hover:bg-red-100 text-red-650 rounded-lg transition-colors inline-flex items-center justify-center"
                              title="Remover monitoramento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CriticalStockManager;
