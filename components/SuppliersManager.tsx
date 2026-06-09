import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Phone,
  Loader2
} from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

interface Supplier {
  id: string | null;
  digifarma_id: number;
  name: string;
  representante: string;
  telefone: string;
  prazo_boletos: string;
}

export default function SuppliersManager() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({});

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/purchasing/suppliers`);
      const data = await res.json();
      setSuppliers(data);
    } catch (err) {
      console.error('Erro ao buscar fornecedores:', err);
    }
  };

  const handleSaveSupplierDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplier.digifarma_id) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/purchasing/suppliers/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSupplier)
      });
      if (res.ok) {
        setShowModal(false);
        fetchSuppliers();
      }
    } catch (err) {
      console.error('Erro ao salvar detalhes do fornecedor:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setNewSupplier(supplier);
    setShowModal(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-6 h-6 text-amber-600" />
              Cadastro de Fornecedores
            </h2>
            <p className="text-sm text-slate-500 font-medium italic mt-1">Gerencie os contatos para cotação automática</p>
          </div>
        </div>

        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left responsive-table">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">ID Digifarma</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Fornecedor</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Representante</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Telefone / WhatsApp</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Prazo Boletos</th>
                <th className="px-8 py-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-slate-400 text-sm italic">
                    Carregando fornecedores do Digifarma...
                  </td>
                </tr>
              ) : (
                suppliers.map(s => (
                  <tr key={s.digifarma_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-8 py-5">
                      <span className="font-mono text-slate-400 text-xs">{s.digifarma_id}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="font-black text-slate-700 dark:text-slate-200">{s.name}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-slate-500 font-medium text-sm">{s.representante || '-'}</span>
                    </td>
                    <td className="px-8 py-5">
                      {s.telefone ? (
                        <div className="flex items-center gap-2 text-slate-500 font-medium">
                          <Phone className="w-3.5 h-3.5" />
                          {s.telefone}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-sm italic">Sem telefone</span>
                      )}
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-slate-500 font-medium text-sm">{s.prazo_boletos || '-'}</span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button 
                        onClick={() => handleEditSupplier(s)}
                        className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                      >
                        Editar Detalhes
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-md shadow-2xl border border-white/20 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">Detalhes do Fornecedor</h3>
                  <p className="text-sm font-medium text-amber-600">{newSupplier.name}</p>
                </div>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveSupplierDetails} className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block">Nome do Representante</label>
                  <input 
                    type="text" 
                    value={newSupplier.representante || ''}
                    onChange={e => setNewSupplier({...newSupplier, representante: e.target.value})}
                    placeholder="Ex: João Silva"
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-amber-500 transition-all shadow-inner"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block">Telefone / WhatsApp do Representante</label>
                  <input 
                    type="text" 
                    required
                    value={newSupplier.telefone || ''}
                    onChange={e => setNewSupplier({...newSupplier, telefone: e.target.value})}
                    placeholder="Ex: 553299999999"
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-amber-500 transition-all shadow-inner"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block">Prazo de Boletos</label>
                  <input 
                    type="text" 
                    value={newSupplier.prazo_boletos || ''}
                    onChange={e => setNewSupplier({...newSupplier, prazo_boletos: e.target.value})}
                    placeholder="Ex: 30/60/90 dias"
                    className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-amber-500 transition-all shadow-inner"
                  />
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
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Dados'}
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

function XIcon(props: any) {
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
