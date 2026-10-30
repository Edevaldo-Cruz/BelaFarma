import React, { useState, useEffect, useCallback } from 'react';
import { 
  Package, 
  Search, 
  Filter, 
  Plus, 
  Pencil, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  DollarSign, 
  BarChart3, 
  CheckCircle2, 
  AlertTriangle,
  X,
  Database,
  ArrowUpDown
} from 'lucide-react';
import { useToast } from '../ToastContext';

interface ProductItem {
  code: string;
  barcode: string;
  name: string;
  presentation: string;
  category_id: number | null;
  sale_price: number;
  promo_price: number;
  cost_price: number;
  stock_qty: number;
  curve: string;
  tributacao_monofasica: string | null;
  ncm: string | null;
  cest: string | null;
  updated_at: string;
}

interface StockStats {
  total_produtos: number;
  produtos_com_estoque: number;
  qtd_total_itens: number;
  valor_total_custo: number;
  valor_total_venda: number;
}

export const ProductsCatalog: React.FC = () => {
  const { addToast } = useToast();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [stats, setStats] = useState<StockStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Filtros
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'with_stock' | 'zero_stock'>('all');
  const [curveFilter, setCurveFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');

  // Modal de Edição
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [editSalePrice, setEditSalePrice] = useState<number>(0);
  const [editPromoPrice, setEditPromoPrice] = useState<number>(0);
  const [editCostPrice, setEditCostPrice] = useState<number>(0);
  const [editStockQty, setEditStockQty] = useState<number>(0);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Modal de Cadastro
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBarcode, setNewBarcode] = useState('');
  const [newSalePrice, setNewSalePrice] = useState<string>('');
  const [newCostPrice, setNewCostPrice] = useState<string>('');
  const [newStockQty, setNewStockQty] = useState<string>('0');
  const [newNcm, setNewNcm] = useState('');
  const [isSavingNew, setIsSavingNew] = useState(false);

  // Modal de Migração / Sincronização
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Carregar Estatísticas
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/erp/products/stats');
      if (res.ok) {
        const json = await res.json();
        setStats(json.data);
      }
    } catch (e) {}
  };

  // Carregar Produtos Paginados
  const fetchProducts = useCallback(async (targetPage = page) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '50',
        q: search.trim(),
        stockFilter,
        curve: curveFilter
      });

      const res = await fetch(`/api/erp/products/catalog?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setProducts(json.products || []);
        setTotalPages(json.totalPages || 1);
        setTotalItems(json.total || 0);
        setPage(json.page || 1);
      }
    } catch (e) {
      addToast('Erro ao carregar catálogo de produtos.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, stockFilter, curveFilter, addToast]);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchProducts(1);
  }, [search, stockFilter, curveFilter]);

  // Abrir Modal de Edição
  const handleOpenEdit = (p: ProductItem) => {
    setEditingProduct(p);
    setEditSalePrice(p.sale_price);
    setEditPromoPrice(p.promo_price);
    setEditCostPrice(p.cost_price);
    setEditStockQty(p.stock_qty);
  };

  // Salvar Edição
  const handleSaveEdit = async () => {
    if (!editingProduct) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/erp/products/${editingProduct.code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_price: parseFloat(String(editSalePrice)) || 0,
          promo_price: parseFloat(String(editPromoPrice)) || 0,
          cost_price: parseFloat(String(editCostPrice)) || 0,
          stock_qty: parseFloat(String(editStockQty)) || 0
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`Produto ${editingProduct.name.substring(0, 20)}... atualizado!`, 'success');
        setEditingProduct(null);
        fetchProducts(page);
        fetchStats();
      } else {
        addToast(json.error || 'Erro ao salvar alterações.', 'error');
      }
    } catch (e) {
      addToast('Erro de comunicação.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Cadastrar Novo Produto
  const handleSaveNewProduct = async () => {
    if (!newName.trim()) {
      addToast('O nome do produto é obrigatório.', 'warning');
      return;
    }

    setIsSavingNew(true);
    try {
      const res = await fetch('/api/erp/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          barcode: newBarcode.trim() || undefined,
          sale_price: parseFloat(newSalePrice.replace(',', '.')) || 0,
          cost_price: parseFloat(newCostPrice.replace(',', '.')) || 0,
          stock_qty: parseFloat(newStockQty.replace(',', '.')) || 0,
          ncm: newNcm.trim() || null
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        addToast('Produto cadastrado com sucesso!', 'success');
        setIsNewProductOpen(false);
        setNewName('');
        setNewBarcode('');
        setNewSalePrice('');
        setNewCostPrice('');
        setNewStockQty('0');
        setNewNcm('');
        fetchProducts(1);
        fetchStats();
      } else {
        addToast(json.error || 'Erro ao cadastrar produto.', 'error');
      }
    } catch (e) {
      addToast('Erro ao cadastrar produto.', 'error');
    } finally {
      setIsSavingNew(false);
    }
  };

  // Disparar Sincronização / Migração do Digifarma
  const handleRunMigration = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/erp/migration/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceCacheOnly: false })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`Sincronização concluída! ${json.productsMigrated} produtos atualizados.`, 'success', 6000);
        setIsSyncModalOpen(false);
        fetchProducts(1);
        fetchStats();
      } else {
        addToast(json.error || 'Falha na sincronização.', 'error');
      }
    } catch (e) {
      addToast('Erro de conexão durante a sincronização.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-3 sm:p-5 overflow-y-auto">
      {/* 1. TOPO: Título e Ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm mb-4">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-600" />
            Catálogo & Estoque Nativo (Belinha ERP)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Controle mestre de produtos, ajuste rápido de preços e saldo físico
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sincronizar Digifarma
          </button>

          <button
            onClick={() => setIsNewProductOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Novo Produto
          </button>
        </div>
      </div>

      {/* 2. CARDS DE MÉTRICAS */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm">
            <p className="text-[10px] font-black uppercase text-slate-400">Total de Produtos</p>
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white mt-0.5">
              {stats.total_produtos.toLocaleString('pt-BR')}
            </p>
            <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
              {stats.produtos_com_estoque.toLocaleString('pt-BR')} com estoque positivo
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm">
            <p className="text-[10px] font-black uppercase text-slate-400">Itens em Estoque</p>
            <p className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
              {stats.qtd_total_itens.toLocaleString('pt-BR')} un
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Volumes físicos totais</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm">
            <p className="text-[10px] font-black uppercase text-slate-400">Estoque a Custo (CMV)</p>
            <p className="text-xl font-black font-mono text-blue-600 dark:text-blue-400 mt-0.5">
              R$ {stats.valor_total_custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Patrimônio imobilizado</p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm">
            <p className="text-[10px] font-black uppercase text-slate-400">Estoque a Venda</p>
            <p className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
              R$ {stats.valor_total_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
              Margem bruta potencial: {stats.valor_total_venda > 0 ? (((stats.valor_total_venda - stats.valor_total_custo) / stats.valor_total_venda) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </div>
      )}

      {/* 3. BARRA DE FILTROS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por código de barras, código ou descrição..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Filtro Estoque */}
          <select
            value={stockFilter}
            onChange={e => setStockFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
          >
            <option value="all">Estoque: Todos</option>
            <option value="with_stock">Apenas com Saldo (&gt; 0)</option>
            <option value="zero_stock">Apenas Zerados (= 0)</option>
          </select>

          {/* Filtro Curva ABC */}
          <select
            value={curveFilter}
            onChange={e => setCurveFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
          >
            <option value="all">Curva: Todas</option>
            <option value="A">Curva A (Mais Vendidos)</option>
            <option value="B">Curva B</option>
            <option value="C">Curva C</option>
          </select>
        </div>
      </div>

      {/* 4. TABELA DE ALTA DENSIDADE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-2.5 px-3 whitespace-nowrap w-24">Código</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Produto / Apresentação</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-center w-14">Curva</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right w-24">Custo</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right w-24">Preço Venda</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right w-24">Promoção</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-center w-24">Saldo Físico</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-center w-16">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                    <span className="font-bold">Carregando catálogo...</span>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 font-bold">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              ) : (
                products.map(p => (
                  <tr key={p.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-2 px-3 font-mono font-bold text-slate-500 whitespace-nowrap">
                      {p.code}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {p.name} {p.presentation}
                        </span>
                        {p.barcode && (
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {p.barcode}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                        p.curve === 'A' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                        p.curve === 'B' ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {p.curve || 'C'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                      R$ {p.cost_price.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      R$ {p.sale_price.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
                      {p.promo_price > 0 ? (
                        <span className="font-bold text-amber-600">R$ {p.promo_price.toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700">-</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center whitespace-nowrap font-mono font-bold">
                      <span className={`px-2 py-0.5 rounded-full ${
                        p.stock_qty > 0 
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                          : 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
                      }`}>
                        {p.stock_qty} un
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-1 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Editar Preço e Estoque"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINAÇÃO */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">
            Exibindo <strong>{products.length}</strong> de <strong>{totalItems.toLocaleString('pt-BR')}</strong> produtos (Página {page} de {totalPages})
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (page > 1) {
                  setPage(p => p - 1);
                  fetchProducts(page - 1);
                }
              }}
              disabled={page <= 1 || isLoading}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono font-bold text-slate-800 dark:text-slate-200">
              {page}
            </span>
            <button
              onClick={() => {
                if (page < totalPages) {
                  setPage(p => p + 1);
                  fetchProducts(page + 1);
                }
              }}
              disabled={page >= totalPages || isLoading}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-800"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. MODAL: EDIÇÃO RÁPIDA DE PREÇO E ESTOQUE */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">Ajuste de Preço e Estoque</h3>
                <p className="text-xs text-slate-400 truncate max-w-xs">{editingProduct.name}</p>
              </div>
              <button onClick={() => setEditingProduct(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Preço Normal de Venda (R$):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editSalePrice}
                  onChange={e => setEditSalePrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Preço Promocional (R$) - 0 para desativar:
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editPromoPrice}
                  onChange={e => setEditPromoPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold text-sm text-amber-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Custo Médio / CMV (R$):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editCostPrice}
                    onChange={e => setEditCostPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Saldo Físico em Estoque:
                  </label>
                  <input
                    type="number"
                    value={editStockQty}
                    onChange={e => setEditStockQty(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold text-sm text-emerald-600"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setEditingProduct(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                {isSavingEdit ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: NOVO PRODUTO */}
      {isNewProductOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                Cadastrar Novo Produto
              </h3>
              <button onClick={() => setIsNewProductOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Descrição Completa do Produto *:
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Ex: DIPIRONA 500MG COM 10 COMPRIMIDOS"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Código de Barras (EAN):
                </label>
                <input
                  type="text"
                  value={newBarcode}
                  onChange={e => setNewBarcode(e.target.value)}
                  placeholder="Ex: 7891234567890 (opcional)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Preço de Venda (R$):
                  </label>
                  <input
                    type="text"
                    value={newSalePrice}
                    onChange={e => setNewSalePrice(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Custo (R$):
                  </label>
                  <input
                    type="text"
                    value={newCostPrice}
                    onChange={e => setNewCostPrice(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Estoque Inicial (un):
                  </label>
                  <input
                    type="number"
                    value={newStockQty}
                    onChange={e => setNewStockQty(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    NCM Fiscal:
                  </label>
                  <input
                    type="text"
                    value={newNcm}
                    onChange={e => setNewNcm(e.target.value)}
                    placeholder="3004.90.99"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-xs font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIsNewProductOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveNewProduct}
                disabled={isSavingNew}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                {isSavingNew ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Cadastrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: SINCRONIZAR DIGIFARMA */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2 mb-2">
              <RefreshCw className="w-5 h-5 text-emerald-600" />
              Sincronizar com Banco do Digifarma
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              Esta ação importará e atualizará o catálogo de produtos e saldos de crediário a partir dos dados do Digifarma para manter o Belinha 100% atualizado.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setIsSyncModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold"
              >
                Voltar
              </button>
              <button
                onClick={handleRunMigration}
                disabled={isSyncing}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
              >
                {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Iniciar Sincronização
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
