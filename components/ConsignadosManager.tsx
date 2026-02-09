
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, DollarSign, Plus, Search, User as UserIcon, 
  ArrowRight, Trash2, Edit2, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, ShoppingBag
} from 'lucide-react';
import { User, ConsignadoSupplier, ConsignadoProduct } from '../types';
import { useToast } from './ToastContext';

interface ConsignadosManagerProps {
  user: User;
  onLog: (action: string, details: string) => void;
}

export const ConsignadosManager: React.FC<ConsignadosManagerProps> = ({ user, onLog }) => {
  const { addToast } = useToast();
  const [suppliers, setSuppliers] = useState<ConsignadoSupplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [products, setProducts] = useState<ConsignadoProduct[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);

  // Forms
  const [supplierForm, setSupplierForm] = useState({ name: '', contact: '', pixKey: '' });
  const [productForm, setProductForm] = useState({ name: '', costPrice: '', salePrice: '', initialQty: '' });
  const [stockForm, setStockForm] = useState({ id: '', currentStock: 0, soldQty: 0, name: '' });

  // Dashboard Stats
  const totalStockValue = useMemo(() => suppliers.reduce((acc, s) => acc + (s.totalStockValue || 0), 0), [suppliers]);
  const totalDebt = useMemo(() => suppliers.reduce((acc, s) => acc + (s.totalDebt || 0), 0), [suppliers]);

  // Fetch Suppliers
  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/consignado/suppliers');
      if (!res.ok) throw new Error('Failed to fetch suppliers');
      const data = await res.json();
      setSuppliers(data);
    } catch (err) {
      console.error(err);
      addToast('Erro ao carregar fornecedores', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Fetch Products when supplier selected
  useEffect(() => {
    if (selectedSupplierId) {
      const fetchProducts = async () => {
        try {
          const res = await fetch(`/api/consignado/products/${selectedSupplierId}`);
          const data = await res.json();
          setProducts(data);
        } catch (err) {
            console.error(err);
        }
      };
      fetchProducts();
    } else {
        setProducts([]);
    }
  }, [selectedSupplierId]);

  // Handlers
  const handleSaveSupplier = async () => {
    if (!supplierForm.name) return addToast('Nome é obrigatório', 'warning');
    try {
      const res = await fetch('/api/consignado/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supplierForm)
      });
      if (!res.ok) throw new Error();
      addToast('Fornecedor cadastrado!', 'success');
      setIsSupplierModalOpen(false);
      setSupplierForm({ name: '', contact: '', pixKey: '' });
      fetchSuppliers();
    } catch (err) {
      addToast('Erro ao salvar fornecedor', 'error');
    }
  };

  const handleSaveProduct = async () => {
    if (!productForm.name || !selectedSupplierId) return;
    try {
      const payload = {
          supplierId: selectedSupplierId,
          name: productForm.name,
          costPrice: parseFloat(productForm.costPrice) || 0,
          salePrice: parseFloat(productForm.salePrice) || 0,
          initialQty: parseInt(productForm.initialQty) || 0
      };

      const res = await fetch('/api/consignado/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error();
      
      addToast('Produto adicionado!', 'success');
      setIsProductModalOpen(false);
      setProductForm({ name: '', costPrice: '', salePrice: '', initialQty: '' });
      
      // Refresh products & suppliers (to update stats)
      const prodRes = await fetch(`/api/consignado/products/${selectedSupplierId}`);
      setProducts(await prodRes.json());
      fetchSuppliers();
      
    } catch (err) {
      addToast('Erro ao salvar produto', 'error');
    }
  };

  const handleUpdateStock = async () => {
      try {
          const res = await fetch(`/api/consignado/products/${stockForm.id}/update-stock`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ currentStock: stockForm.currentStock, soldQty: stockForm.soldQty })
          });
          if (!res.ok) throw new Error();
          
          addToast('Estoque atualizado!', 'success');
          setIsStockModalOpen(false);
          
          // Refresh
          if(selectedSupplierId) {
            const prodRes = await fetch(`/api/consignado/products/${selectedSupplierId}`);
            setProducts(await prodRes.json());
            fetchSuppliers();
          }
      } catch(err) {
          addToast('Erro ao atualizar estoque', 'error');
      }
  };

  const handleDeleteSupplier = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(!confirm('Excluir este fornecedor e todos os seus produtos?')) return;
      
      try {
          const res = await fetch(`/api/consignado/suppliers/${id}`, { method: 'DELETE' });
          if(!res.ok) throw new Error();
          addToast('Fornecedor excluído', 'success');
          if(selectedSupplierId === id) setSelectedSupplierId(null);
          fetchSuppliers();
      } catch(err) {
          addToast('Erro ao excluir', 'error');
      }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Gestão de Consignados</h1>
          <p className="text-slate-500 font-medium italic">Controle de estoque e pagamentos de terceiros.</p>
        </div>
        <button 
          onClick={() => setIsSupplierModalOpen(true)}
          className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-105 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Novo Fornecedor
        </button>
      </header>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-6 opacity-5"><Package className="w-24 h-24" /></div>
             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Valor Total em Estoque (Venda Estimated)</p>
             <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400">
                 {totalStockValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
             </p>
        </div>
        
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-6 opacity-5"><DollarSign className="w-24 h-24" /></div>
             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Total a Pagar (Produtos Vendidos)</p>
             <p className="text-4xl font-black text-red-600 dark:text-red-400">
                 {totalDebt.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
             </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Supplier List */}
          <div className="lg:col-span-1 space-y-4">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest ml-1">Fornecedores</h3>
              <div className="space-y-3">
                  {suppliers.map(sup => (
                      <div 
                        key={sup.id}
                        onClick={() => setSelectedSupplierId(sup.id)}
                        className={`p-6 rounded-2xl border-2 cursor-pointer transition-all group relative ${selectedSupplierId === sup.id ? 'bg-slate-900 border-slate-900 text-white shadow-xl scale-[1.02]' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}
                      >
                          <div className="flex justify-between items-start">
                              <div>
                                  <h4 className="font-black text-lg uppercase tracking-tight line-clamp-1">{sup.name}</h4>
                                  <p className={`text-xs mt-1 ${selectedSupplierId === sup.id ? 'text-slate-400' : 'text-slate-500'}`}>
                                      {sup.productCount || 0} produtos • Dívida: {(sup.totalDebt || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </p>
                              </div>
                              {selectedSupplierId === sup.id && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                          </div>
                          
                          <button 
                            onClick={(e) => handleDeleteSupplier(sup.id, e)}
                            className="absolute bottom-4 right-4 p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          >
                              <Trash2 className="w-4 h-4" />
                          </button>
                      </div>
                  ))}
                  
                  {suppliers.length === 0 && !loading && (
                      <div className="text-center py-10 text-slate-400 text-sm">Nenhum fornecedor cadastrado.</div>
                  )}
              </div>
          </div>

          {/* Supplier Details & Products */}
          <div className="lg:col-span-2">
              {selectedSupplierId ? (
                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm p-8 min-h-[500px]">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
                                {suppliers.find(s => s.id === selectedSupplierId)?.name}
                            </h2>
                            <p className="text-slate-500 text-sm font-medium mt-1">
                                {suppliers.find(s => s.id === selectedSupplierId)?.contact || 'Sem contato'} • 
                                Pix: {suppliers.find(s => s.id === selectedSupplierId)?.pixKey || 'N/A'}
                            </p>
                        </div>
                        <button 
                            onClick={() => setIsProductModalOpen(true)}
                            className="bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 px-5 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 hover:bg-emerald-100 transition-all"
                        >
                            <Plus className="w-4 h-4" /> Adicionar Produto
                        </button>
                    </div>

                    {/* Products Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] uppercase text-slate-400 font-black border-b border-slate-100 dark:border-slate-800">
                                    <th className="pb-4 pl-4">Produto</th>
                                    <th className="pb-4 text-right">Custo</th>
                                    <th className="pb-4 text-right">Venda</th>
                                    <th className="pb-4 text-center">Estoque</th>
                                    <th className="pb-4 text-center">Vendido</th>
                                    <th className="pb-4 text-right">A Pagar</th>
                                    <th className="pb-4 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {products.map(prod => (
                                    <tr key={prod.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="py-4 pl-4 font-bold text-slate-700 dark:text-slate-300">{prod.name}</td>
                                        <td className="py-4 text-right font-mono text-xs">{prod.costPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td className="py-4 text-right font-mono text-xs">{prod.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td className="py-4 text-center font-black text-slate-800 dark:text-slate-200">{prod.currentStock}</td>
                                        <td className="py-4 text-center font-black text-red-600">{prod.soldQty}</td>
                                        <td className="py-4 text-right font-black text-red-600">
                                            {(prod.soldQty * prod.costPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </td>
                                        <td className="py-4 text-center">
                                            <button 
                                                onClick={() => {
                                                    setStockForm({ id: prod.id, currentStock: prod.currentStock, soldQty: prod.soldQty, name: prod.name });
                                                    setIsStockModalOpen(true);
                                                }}
                                                className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors"
                                                title="Atualizar Estoque/Vendas"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {products.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-slate-400 text-xs font-bold uppercase">Nenhum produto cadastrado para este fornecedor.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                </div>
              ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2.5rem]">
                    <Package className="w-16 h-16 mb-4 opacity-50" />
                    <p className="font-bold uppercase tracking-widest text-xs">Selecione um fornecedor</p>
                </div>
              )}
          </div>
      </div>

      {/* MODAL: NEW SUPPLIER */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
                <h2 className="text-xl font-black uppercase mb-6">Novo Fornecedor</h2>
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Nome*</label>
                        <input className="w-full px-4 py-3 rounded-xl bg-slate-50 border-2 border-slate-100 font-bold outline-none focus:border-indigo-500" autoFocus 
                            value={supplierForm.name} onChange={e => setSupplierForm({...supplierForm, name: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Contato</label>
                        <input className="w-full px-4 py-3 rounded-xl bg-slate-50 border-2 border-slate-100 font-bold outline-none" 
                            value={supplierForm.contact} onChange={e => setSupplierForm({...supplierForm, contact: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Chave Pix</label>
                        <input className="w-full px-4 py-3 rounded-xl bg-slate-50 border-2 border-slate-100 font-bold outline-none" 
                            value={supplierForm.pixKey} onChange={e => setSupplierForm({...supplierForm, pixKey: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-8">
                        <button onClick={() => setIsSupplierModalOpen(false)} className="py-3 rounded-xl font-black uppercase text-xs bg-slate-100 text-slate-500">Cancelar</button>
                        <button onClick={handleSaveSupplier} className="py-3 rounded-xl font-black uppercase text-xs bg-slate-900 text-white shadow-lg">Salvar</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* MODAL: NEW PRODUCT */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
                <h2 className="text-xl font-black uppercase mb-6">Novo Produto Consignado</h2>
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Nome do Produto*</label>
                        <input className="w-full px-4 py-3 rounded-xl bg-slate-50 border-2 border-slate-100 font-bold outline-none focus:border-indigo-500" autoFocus 
                            value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Preço de Custo (Pago)*</label>
                            <input type="number" step="0.01" className="w-full px-4 py-3 rounded-xl bg-slate-50 border-2 border-slate-100 font-bold outline-none" 
                                value={productForm.costPrice} onChange={e => setProductForm({...productForm, costPrice: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Preço de Venda*</label>
                            <input type="number" step="0.01" className="w-full px-4 py-3 rounded-xl bg-slate-50 border-2 border-slate-100 font-bold outline-none" 
                                value={productForm.salePrice} onChange={e => setProductForm({...productForm, salePrice: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Estoque Inicial (Recebido)*</label>
                        <input type="number" className="w-full px-4 py-3 rounded-xl bg-slate-50 border-2 border-slate-100 font-bold outline-none" 
                            value={productForm.initialQty} onChange={e => setProductForm({...productForm, initialQty: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-8">
                        <button onClick={() => setIsProductModalOpen(false)} className="py-3 rounded-xl font-black uppercase text-xs bg-slate-100 text-slate-500">Cancelar</button>
                        <button onClick={handleSaveProduct} className="py-3 rounded-xl font-black uppercase text-xs bg-emerald-600 text-white shadow-lg">Adicionar</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* MODAL: STOCK UPDATE */}
      {isStockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
                <h2 className="text-lg font-black uppercase mb-1 line-clamp-1">{stockForm.name}</h2>
                <p className="text-xs text-slate-400 font-bold uppercase mb-6">Atualizar Contagem</p>
                
                <div className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Em Estoque (Gôndola)</label>
                        <div className="flex items-center gap-4">
                            <button onClick={() => setStockForm({...stockForm, currentStock: Math.max(0, stockForm.currentStock - 1)})} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200"><ChevronDown className="w-4 h-4" /></button>
                            <input type="number" className="flex-1 px-4 py-3 rounded-xl bg-secondary border-2 border-slate-100 font-black text-center text-2xl outline-none" 
                                value={stockForm.currentStock} onChange={e => setStockForm({...stockForm, currentStock: parseInt(e.target.value) || 0})} />
                            <button onClick={() => setStockForm({...stockForm, currentStock: stockForm.currentStock + 1})} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200"><ChevronUp className="w-4 h-4" /></button>
                        </div>
                    </div>
                    
                    <div>
                        <label className="text-[10px] font-black uppercase text-red-400 ml-2">Vendidos (A Pagar)</label>
                        <div className="flex items-center gap-4">
                            <button onClick={() => setStockForm({...stockForm, soldQty: Math.max(0, stockForm.soldQty - 1)})} className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100"><ChevronDown className="w-4 h-4" /></button>
                            <input type="number" className="flex-1 px-4 py-3 rounded-xl bg-red-50 border-2 border-red-100 text-red-600 font-black text-center text-2xl outline-none" 
                                value={stockForm.soldQty} onChange={e => setStockForm({...stockForm, soldQty: parseInt(e.target.value) || 0})} />
                            <button onClick={() => setStockForm({...stockForm, soldQty: stockForm.soldQty + 1})} className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100"><ChevronUp className="w-4 h-4" /></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-8">
                        <button onClick={() => setIsStockModalOpen(false)} className="py-3 rounded-xl font-black uppercase text-xs bg-slate-100 text-slate-500">Cancelar</button>
                        <button onClick={handleUpdateStock} className="py-3 rounded-xl font-black uppercase text-xs bg-indigo-600 text-white shadow-lg">Confirmar</button>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};
