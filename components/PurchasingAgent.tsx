import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Users, 
  FileText, 
  Plus, 
  Trash2, 
  Send, 
  Loader2,
  AlertCircle, 
  CheckCircle2,
  Phone,
  Tag,
  Search,
  BrainCircuit,
  Sparkles
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  whatsapp: string;
  category: string;
  createdAt: string;
}

export default function PurchasingAgent() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'suppliers'>('dashboard');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', whatsapp: '', category: 'Medicamentos' });
  const [sendingQuotes, setSendingQuotes] = useState(false);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/purchasing/suppliers');
      const data = await res.json();
      setSuppliers(data);
    } catch (err) {
      console.error('Erro ao buscar fornecedores:', err);
    }
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/purchasing/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSupplier)
      });
      if (res.ok) {
        setNewSupplier({ name: '', whatsapp: '', category: 'Medicamentos' });
        setShowModal(false);
        fetchSuppliers();
      }
    } catch (err) {
      console.error('Erro ao adicionar fornecedor:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este fornecedor?')) return;
    try {
      await fetch(`http://localhost:3001/api/purchasing/suppliers/${id}`, { method: 'DELETE' });
      fetchSuppliers();
    } catch (err) {
      console.error('Erro ao excluir fornecedor:', err);
    }
  };

  const handleAnalyzeReports = async () => {
    setAnalyzing(true);
    setSuggestion(null);
    try {
      const res = await fetch('http://localhost:3001/api/purchasing/analyze-reports', { method: 'POST' });
      const data = await res.json();
      if (data.suggestion) {
        setSuggestion(data.suggestion);
      } else {
        alert(data.error || 'Erro ao analisar relatórios');
      }
    } catch (err) {
      console.error('Erro ao analisar relatórios:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSendQuotes = async () => {
    if (!suggestion) return;
    const category = suggestion.toLowerCase().includes('perfumaria') ? 'Perfumaria' : 'Medicamentos';
    
    if (!confirm(`Deseja enviar a cotação de ${category} para todos os fornecedores cadastrados desta categoria?`)) return;

    setSendingQuotes(true);
    try {
      const res = await fetch('http://localhost:3001/api/purchasing/send-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          list: suggestion,
          category
        })
      });
      const data = await res.json();
      alert('Cotações enviadas com sucesso!');
    } catch (err) {
      console.error('Erro ao enviar cotações:', err);
    } finally {
      setSendingQuotes(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3">
              <ShoppingCart className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                Isa-Compras
                <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase rounded-full">Gestora</span>
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium italic">&ldquo;Comprar bem é o primeiro passo para vender com lucro.&rdquo;</p>
            </div>
          </div>
          
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white dark:bg-slate-700 text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <FileText className="w-3.5 h-3.5" />
              Relatórios
            </button>
            <button 
              onClick={() => setActiveTab('suppliers')}
              className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeTab === 'suppliers' ? 'bg-white dark:bg-slate-700 text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Users className="w-3.5 h-3.5" />
              Fornecedores
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'dashboard' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Analysis Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-amber-500" />
                    Análise Digifarma
                  </h2>
                  <p className="text-sm text-slate-500 font-medium">Processamento de Curva ABC e Estoque</p>
                </div>
                <button 
                  onClick={handleAnalyzeReports}
                  disabled={analyzing}
                  className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-2xl text-sm font-bold shadow-lg hover:shadow-orange-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {analyzing ? 'Analisando...' : 'Iniciar Análise'}
                </button>
              </div>

              {!suggestion && !analyzing && (
                <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center">
                  <div className="h-16 w-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="text-slate-600 dark:text-slate-300 font-bold mb-2">Nenhuma análise ativa</h3>
                  <p className="text-slate-400 text-sm max-w-sm mx-auto">
                    Coloque os relatórios CSV ou PDF do Digifarma na pasta <code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs">backend/reports/digifarma</code> e clique em Iniciar Análise.
                  </p>
                </div>
              )}

              {suggestion && (
                <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap font-mono text-sm leading-relaxed">
                      {suggestion}
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-3">
                    <button 
                      onClick={() => setSuggestion(null)}
                      className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700"
                    >
                      Descartar
                    </button>
                    <button 
                      onClick={handleSendQuotes}
                      disabled={sendingQuotes}
                      className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {sendingQuotes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Disparar Cotação para Fornecedores
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tips / Summary Pane */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
               <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
               <h3 className="text-base font-black mb-4 flex items-center gap-2">
                 <Tag className="w-4 h-4 text-amber-400" />
                 Rotinas da Isa
               </h3>
               <ul className="space-y-5">
                 <li className="flex gap-4">
                   <div className="h-2 w-2 bg-amber-500 rounded-full mt-2 flex-shrink-0" />
                   <div>
                     <p className="text-xs font-black text-amber-400 uppercase tracking-widest mb-1">Terça-Feira</p>
                     <p className="text-sm text-slate-300 leading-snug">Dia de focar nos medicamentos e faltas crônicas.</p>
                   </div>
                 </li>
                 <li className="flex gap-4">
                   <div className="h-2 w-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
                   <div>
                     <p className="text-xs font-black text-purple-400 uppercase tracking-widest mb-1">Quarta-Feira</p>
                     <p className="text-sm text-slate-300 leading-snug">Perfumaria e HPC. De olho nas novidades e giro.</p>
                   </div>
                 </li>
               </ul>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Resumo da Loja
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <span className="text-xs font-bold text-slate-500">Fornecedores ativos</span>
                  <span className="text-sm font-black text-slate-800 dark:text-slate-100">{suppliers.length}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <span className="text-xs font-bold text-slate-500">Cat. Medicamentos</span>
                  <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                    {suppliers.filter(s => s.category === 'Medicamentos').length}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <span className="text-xs font-bold text-slate-500">Cat. Perfumaria</span>
                  <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                    {suppliers.filter(s => s.category === 'Perfumaria').length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Suppliers Tab */
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">Cadastro de Fornecedores</h2>
              <p className="text-sm text-slate-500 font-medium italic">Gerencie os contatos para cotação automática</p>
            </div>
            <button 
              onClick={() => setShowModal(true)}
              className="px-6 py-3 bg-amber-600 text-white rounded-2xl text-sm font-bold shadow-lg hover:bg-amber-700 transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Novo Fornecedor
            </button>
          </div>

          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Fornecedor</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">WhatsApp</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Categoria</th>
                  <th className="px-8 py-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-8 py-12 text-center text-slate-400 text-sm italic">
                      Nenhum fornecedor cadastrado.
                    </td>
                  </tr>
                ) : (
                  suppliers.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                      <td className="px-8 py-5">
                        <span className="font-black text-slate-700 dark:text-slate-200">{s.name}</span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2 text-slate-500 font-medium">
                          <Phone className="w-3.5 h-3.5" />
                          {s.whatsapp}
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                          s.category === 'Medicamentos' 
                          ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400' 
                          : 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400'
                        }`}>
                          {s.category}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button 
                          onClick={() => handleDeleteSupplier(s.id)}
                          className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Novo Fornecedor */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-md shadow-2xl border border-white/20 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">Novo Fornecedor</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddSupplier} className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block">Nome do Fornecedor</label>
                  <input 
                    type="text" 
                    required
                    value={newSupplier.name}
                    onChange={e => setNewSupplier({...newSupplier, name: e.target.value})}
                    placeholder="Ex: Santa Cruz"
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-amber-500 transition-all shadow-inner"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block">WhatsApp (com DDD)</label>
                  <input 
                    type="text" 
                    required
                    value={newSupplier.whatsapp}
                    onChange={e => setNewSupplier({...newSupplier, whatsapp: e.target.value})}
                    placeholder="Ex: 553299999999"
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-amber-500 transition-all shadow-inner"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block">Categoria</label>
                  <select 
                    value={newSupplier.category}
                    onChange={e => setNewSupplier({...newSupplier, category: e.target.value})}
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-amber-500 transition-all shadow-inner"
                  >
                    <option value="Medicamentos">Medicamentos</option>
                    <option value="Perfumaria">Perfumaria</option>
                  </select>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-4 text-sm font-bold text-slate-500 hover:text-slate-700"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="flex-[2] py-4 bg-amber-600 text-white rounded-2xl text-sm font-black shadow-lg shadow-amber-600/20 flex items-center justify-center"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Cadastro'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function X(props: any) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      {...props}
    >
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
  );
}
