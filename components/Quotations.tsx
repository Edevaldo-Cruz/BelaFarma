import React, { useState, useEffect } from 'react';
import { ShoppingCart, MessageCircle, Clock, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

interface Quotation {
  id: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  status: 'Pendente' | 'Enviada' | 'Respondida' | 'Dúvida do Fornecedor';
  quotedPrice: number | null;
  rawMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export const Quotations: React.FC = () => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchQuotations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/purchasing/quotes`);
      const data = await res.json();
      setQuotations(data);
    } catch (err) {
      console.error('Erro ao buscar cotações:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Enviada': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Respondida': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Dúvida do Fornecedor': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Enviada': return <Clock className="w-3.5 h-3.5" />;
      case 'Respondida': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'Dúvida do Fornecedor': return <AlertTriangle className="w-3.5 h-3.5" />;
      default: return <Clock className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-blue-600" /> Painel de Cotações Inteligentes
          </h1>
          <p className="text-slate-500 font-medium">Acompanhe as respostas dos fornecedores em tempo real.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchQuotations}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </header>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse responsive-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Produto</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Preço Cotado</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Última Atualização</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm italic font-bold">
                    Nenhuma cotação ativa no momento.
                  </td>
                </tr>
              ) : (
                quotations.map(q => (
                  <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">{q.productName}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{q.supplierName}</td>
                    <td className="px-6 py-4 font-mono text-slate-700">
                      {q.quotedPrice ? `R$ ${q.quotedPrice.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusColor(q.status)}`}>
                        {getStatusIcon(q.status)} {q.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-500">
                      {new Date(q.updatedAt).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
